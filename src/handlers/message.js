/**
 * Message Handler Pipeline — Phase 5 / Phase 7 hardened
 *
 * Flow:
 *   ctx → filters → DB touch → stat → auto-read → auto-typing
 *       → command routing (prefixed messages)
 *       → passive AI DM trigger (non-prefixed DMs, when enabled)
 *
 * handleMessage() is always async and never throws to its caller.
 */
import { log }            from '../utils/logger.js';
import { touchUser }      from '../database/store.js';
import { incrementStat }  from '../database/store.js';
import { routeCommand }   from './command.js';
import { config }         from '../config/index.js';
import {
  chat,
  isAIEnabledForChat,
  isPassiveDMEnabled,
} from '../services/ai.js';
import { aiRateLimiter }  from '../services/rate-limiter.js';
import { isOwner }        from './middleware.js';
import {
  sendAIRichResponse,
  sendReaction,
  parseAIText,
} from '../services/rich-messages.js';

// ── Passive DM handler ────────────────────────────────────────────────────────

/**
 * handlePassiveAI(sock, ctx) — called when a non-prefixed DM arrives
 * and passive mode is active.
 */
async function handlePassiveAI(sock, ctx) {
  const { chat: chatJid, sender, pushName, body } = ctx;

  if (!body?.trim()) return;
  if (!isAIEnabledForChat(chatJid)) return;

  const exempt = isOwner(sender);
  const rl     = aiRateLimiter.check(sender, exempt);

  if (!rl.allowed) {
    log.debug(`[ai:passive] Rate-limited ${sender}`);
    return;
  }

  try { await sock.sendPresenceUpdate('composing', chatJid); } catch { /* best-effort */ }

  let result;
  try {
    result = await chat(chatJid, sender, body.trim(), {
      senderName: pushName ?? sender,
    });
  } catch (err) {
    log.error(`[ai:passive] Chat error for ${sender}: ${err.message}`);
    try { await sock.sendPresenceUpdate('paused', chatJid); } catch { /* ok */ }

    // Only surface an error to the user when it's a configuration problem
    // (not a transient network/provider failure — those are too noisy in passive mode)
    const isConfigErr = err.message.includes('No AI providers') ||
                        err.message.includes('API key') ||
                        err.message.includes('not configured');
    if (isConfigErr) {
      try {
        await sock.sendMessage(
          chatJid,
          { text: '⚠️ AI is not configured. Ask the bot owner to set up an API key.' },
          { quoted: ctx.rawMessage }
        );
      } catch { /* ok */ }
    }
    return;
  }

  try { await sock.sendPresenceUpdate('paused', chatJid); } catch { /* ok */ }

  const parsed = parseAIText(result.text);
  try { await sendReaction(sock, chatJid, ctx.key, parsed.codeBlocks.length ? '💻' : '✅'); } catch {}

  try {
    await sendAIRichResponse(sock, chatJid, {
      text:       parsed.text,
      codeBlocks: parsed.codeBlocks,
      provider:   result.provider,
      model:      result.model,
      tokens:     result.tokens,
    }, ctx.rawMessage);
  } catch (e) {
    log.error(`[ai:passive] Send error: ${e.message}`);
    // Final fallback — plain text
    try { await sock.sendMessage(chatJid, { text: result.text }, { quoted: ctx.rawMessage }); } catch {}
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * handleMessage(sock, ctx) → boolean
 *
 * Central message pipeline.
 * Returns false if the message was ignored, true if it was processed.
 */
export async function handleMessage(sock, ctx) {
  try {
    // ── 1. Ignore echo / status ────────────────────────────────────────────
    if (ctx.isStatus)    return false;
    if (ctx.isBroadcast) return false;

    // ── 2. DB touch — upsert sender ────────────────────────────────────────
    if (ctx.sender && !ctx.fromMe) {
      try { touchUser(ctx.sender, ctx.pushName || null); }
      catch (dbErr) { log.error(`[pipeline] DB touchUser: ${dbErr.message}`); }
    }

    // ── 3. Increment message stat ──────────────────────────────────────────
    try { incrementStat('messages_total'); }
    catch { /* non-critical */ }

    // ── 4. Auto-read ───────────────────────────────────────────────────────
    if (config.autoRead && !ctx.fromMe) {
      try { await sock.readMessages([ctx.key]); }
      catch { /* best-effort */ }
    }

    // ── 5. Auto-typing indicator ───────────────────────────────────────────
    if (config.autoTyping && !ctx.fromMe && ctx.body) {
      try {
        await sock.sendPresenceUpdate('composing', ctx.chat);
        setTimeout(() => sock.sendPresenceUpdate('paused', ctx.chat).catch(() => {}), 2000);
      } catch { /* best-effort */ }
    }

    // ── 6. Command routing (prefixed messages) ────────────────────────────
    if (ctx.body?.startsWith(config.prefix)) {
      await routeCommand(sock, ctx);
      return true;
    }

    // ── 7. Passive AI DM trigger ──────────────────────────────────────────
    if (
      !ctx.fromMe     &&
      !ctx.isGroup    &&
      ctx.body?.trim() &&
      isPassiveDMEnabled()
    ) {
      await handlePassiveAI(sock, ctx);
      return true;
    }

    return true;
  } catch (e) {
    log.error(`[pipeline] Unhandled error for ${ctx?.messageId}: ${e.message}`);
    return false;
  }
}
