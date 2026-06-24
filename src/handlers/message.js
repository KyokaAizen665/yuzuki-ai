/**
 * Message Handler Pipeline — Phase 3 patch
 *
 * PATCH CHANGES vs Phase 2.5:
 *   • handlePassiveAI: adds suggestedPrompts to sendAIRichResponse call.
 *     Passive DM responses now include the same follow-up buttons as the
 *     explicit .ai command, so suggest_* routing works in both paths.
 *   • All other pipeline logic unchanged.
 *
 * Flow:
 *   ctx → filters → DB touch → stat → auto-read → auto-typing
 *       → command routing (prefixed messages)
 *       → button response routing
 *       → passive AI DM trigger
 */
import { log }            from '../utils/logger.js';
import { touchUser }      from '../database/store.js';
import { incrementStat }  from '../database/store.js';
import { routeCommand }   from './command.js';
import { routeButtonResponse } from './button.js';
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

const BUTTON_CONTENT_TYPES = new Set([
  'interactiveResponseMessage',
  'nativeFlowResponseMessage',
  'buttonsResponseMessage',
]);

// ── Passive DM handler ────────────────────────────────────────────────────────

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

  // PATCH: add suggestedPrompts so passive DM replies include follow-up buttons.
  // These route through button.js suggest_* → .ai <display_text> (Phase 3 fix).
  const suggestedPrompts = parsed.codeBlocks.length
    ? ['Explain this code', 'Improve it', 'Add comments']
    : ['Continue', 'Explain more', 'Give example'];

  try {
    await sendAIRichResponse(sock, chatJid, {
      text:            parsed.text,
      codeBlocks:      parsed.codeBlocks,
      suggestedPrompts,
      provider:        result.provider,
      model:           result.model,
      tokens:          result.tokens,
    }, ctx.rawMessage);
  } catch (e) {
    log.error(`[ai:passive] Send error: ${e.message}`);
    try { await sock.sendMessage(chatJid, { text: result.text }, { quoted: ctx.rawMessage }); } catch {}
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function handleMessage(sock, ctx) {
  try {
    if (ctx.isStatus)    return false;
    if (ctx.isBroadcast) return false;

    if (ctx.sender && !ctx.fromMe) {
      try { touchUser(ctx.sender, ctx.pushName || null); }
      catch (dbErr) { log.error(`[pipeline] DB touchUser: ${dbErr.message}`); }
    }

    try { incrementStat('messages_total'); }
    catch { /* non-critical */ }

    if (config.autoRead && !ctx.fromMe) {
      try { await sock.readMessages([ctx.key]); }
      catch { /* best-effort */ }
    }

    if (config.autoTyping && !ctx.fromMe && ctx.body) {
      try {
        await sock.sendPresenceUpdate('composing', ctx.chat);
        setTimeout(() => sock.sendPresenceUpdate('paused', ctx.chat).catch(() => {}), 2000);
      } catch { /* best-effort */ }
    }

    if (ctx.body?.startsWith(config.prefix)) {
      await routeCommand(sock, ctx);
      return true;
    }

    if (BUTTON_CONTENT_TYPES.has(ctx.contentType) && !ctx.fromMe) {
      log.debug(
        `[pipeline] button tap — contentType=${ctx.contentType}` +
        ` sender=${ctx.sender} body=${JSON.stringify(ctx.body?.slice(0, 80) ?? null)}`
      );
      await routeButtonResponse(sock, ctx);
      return true;
    }

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
