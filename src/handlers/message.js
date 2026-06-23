/**
 * Message Handler Pipeline — Phase 5
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

// ── Passive DM handler ────────────────────────────────────────────────────────

/**
 * handlePassiveAI(sock, ctx) — called when a non-prefixed DM arrives
 * and passive mode is active.
 *
 * Uses the same rate limiter as the .ai command to prevent abuse.
 * Applies per-chat AI toggle (user could have disabled via .ai off).
 */
async function handlePassiveAI(sock, ctx) {
  const { chat: chatJid, sender, pushName, body } = ctx;

  if (!body?.trim()) return;
  if (!isAIEnabledForChat(chatJid)) return;

  const exempt = isOwner(sender);
  const rl     = aiRateLimiter.check(sender, exempt);

  if (!rl.allowed) {
    // Silent throttle in passive mode — no error reply (too noisy)
    log.debug(`[ai:passive] Rate-limited ${sender}`);
    return;
  }

  try {
    await sock.sendPresenceUpdate('composing', chatJid);
  } catch { /* best-effort */ }

  let result;
  try {
    result = await chat(chatJid, sender, body.trim(), {
      senderName: pushName ?? sender,
    });
  } catch (err) {
    log.error(`[ai:passive] Chat error for ${sender}: ${err.message}`);
    try { await sock.sendPresenceUpdate('paused', chatJid); } catch { /* ok */ }
    // In passive mode, only reply with an error if it's a config issue (no key)
    if (err.message.includes('GROQ_API_KEY')) {
      try { await sock.sendMessage(chatJid, { text: '⚠️ AI is not configured yet.' }, { quoted: ctx.rawMessage }); }
      catch { /* ok */ }
    }
    return;
  }

  try { await sock.sendPresenceUpdate('paused', chatJid); } catch { /* ok */ }
  try {
    await sock.sendMessage(chatJid, { text: result.text }, { quoted: ctx.rawMessage });
  } catch (e) {
    log.error(`[ai:passive] Send error: ${e.message}`);
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
    //
    // Only fires when:
    //   a) The message is from someone else (not fromMe)
    //   b) It is a private DM (not a group)
    //   c) Passive DM mode is enabled globally
    //   d) There is actual text content
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
