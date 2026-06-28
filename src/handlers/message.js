/**
 * Message Handler Pipeline — Phase 3 patch + Antilink enforcement
 *
 * PATCH CHANGES vs Phase 3:
 *   • Antilink enforcement: if a group has antilinkEnabled=1, messages
 *     containing URLs or WhatsApp group links from non-admins are deleted
 *     and a warning is sent.
 *   • handlePassiveAI: adds suggestedPrompts to sendAIRichResponse call.
 *
 * Flow:
 *   ctx → filters → DB touch → stat → auto-read → auto-typing
 *       → antilink check (group messages only)
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
import { getGroup } from '../database/store.js';
import { normalizeJid } from '../utils/jid.js';

const BUTTON_CONTENT_TYPES = new Set([
  'interactiveResponseMessage',
  'nativeFlowResponseMessage',
  'buttonsResponseMessage',
]);

// ── Antilink patterns ─────────────────────────────────────────────────────────

const LINK_RE = /https?:\/\/\S+|wa\.me\/\S+|chat\.whatsapp\.com\/\S+/i;

/**
 * checkAntilink(sock, ctx)
 * Returns true if the message was deleted (pipeline should stop).
 */
async function checkAntilink(sock, ctx) {
  if (!ctx.isGroup)  return false;
  if (ctx.fromMe)    return false;
  if (!ctx.body)     return false;
  if (!LINK_RE.test(ctx.body)) return false;

  const jid = normalizeJid(ctx.chat);
  const grp = getGroup(jid);
  if (!grp?.antilinkEnabled) return false;

  // Admins and owner are exempt
  if (isOwner(ctx.sender)) return false;
  try {
    const meta = await sock.groupMetadata(jid);
    const participant = meta?.participants?.find(
      p => normalizeJid(p.id) === normalizeJid(ctx.sender)
    );
    if (participant?.admin) return false; // admin/superadmin exempt
  } catch { /* fail open — don't block on metadata error */ }

  // Delete the message
  try {
    await sock.sendMessage(jid, {
      delete: ctx.key,
    });
  } catch (e) {
    log.warn(`[antilink] Could not delete message from ${ctx.sender}: ${e.message}`);
    return false;
  }

  // Warn the user
  try {
    await sock.sendMessage(jid, {
      text:     `⛔ @${ctx.sender.split('@')[0]}, links are not allowed in this group.`,
      mentions: [ctx.sender],
    });
  } catch { /* best-effort */ }

  log.info(`[antilink] Deleted link from ${ctx.sender} in ${jid}`);
  return true;
}

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
    try { await sock.sendPresenceUpdate('paused', chatJid); } catch {}

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

  try { await sock.sendPresenceUpdate('paused', chatJid); } catch {}

  const parsed = parseAIText(result.text);
  try { await sendReaction(sock, chatJid, ctx.key, parsed.codeBlocks.length ? '💻' : '✅'); } catch {}

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

    // ── Antilink enforcement (before command routing) ──────────────────
    if (ctx.isGroup && !ctx.fromMe) {
      const blocked = await checkAntilink(sock, ctx);
      if (blocked) return true;
    }

    if (ctx.body?.startsWith(config.prefix)) {
      await routeCommand(sock, ctx);
      return true;
    }

    // Sticker caption trigger
    if (
      ctx.contentType === 'stickerMessage' &&
      ctx.media?.caption?.startsWith(config.prefix) &&
      !ctx.fromMe
    ) {
      const stickerCtx = { ...ctx, body: ctx.media.caption };
      await routeCommand(sock, stickerCtx);
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
