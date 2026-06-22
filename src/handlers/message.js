/**
 * Message Handler Pipeline — Phase 2
 *
 * Flow: ctx → middleware → command router → (plugin dispatch in Phase 3)
 *
 * handleMessage() is always async and should never throw to its caller.
 * The event handler in messages.js already wraps it in .catch(), but
 * we double-guard here anyway.
 */
import { log } from '../utils/logger.js';
import { touchUser } from '../database/store.js';
import { incrementStat } from '../database/store.js';
import { routeCommand } from './command.js';
import { config } from '../config/index.js';

/**
 * Central message pipeline.
 * Returns false if the message was ignored, true if it was processed.
 */
export async function handleMessage(sock, ctx) {
  try {
    // ── 1. Ignore echo / status ────────────────────────────────────────────
    if (ctx.isStatus)     return false;
    if (ctx.isBroadcast)  return false;

    // ── 2. DB touch — upsert sender ────────────────────────────────────────
    if (ctx.sender && !ctx.fromMe) {
      try { touchUser(ctx.sender, ctx.pushName || null); }
      catch (dbErr) { log.error(`[pipeline] DB touchUser: ${dbErr.message}`); }
    }

    // ── 3. Increment message stat ──────────────────────────────────────────
    try { incrementStat('messages_total'); }
    catch { /* non-critical */ }

    // ── 4. Auto-read (mark messages as read) ───────────────────────────────
    if (config.autoRead && !ctx.fromMe) {
      try {
        await sock.readMessages([ctx.key]);
      } catch { /* best-effort */ }
    }

    // ── 5. Auto-typing indicator ───────────────────────────────────────────
    if (config.autoTyping && !ctx.fromMe && ctx.body) {
      try {
        await sock.sendPresenceUpdate('composing', ctx.chat);
        setTimeout(() => sock.sendPresenceUpdate('paused', ctx.chat).catch(() => {}), 2000);
      } catch { /* best-effort */ }
    }

    // ── 6. Command routing ────────────────────────────────────────────────
    if (ctx.body?.startsWith(config.prefix)) {
      await routeCommand(sock, ctx);
      return true;
    }

    // ── 7. Future: plugin message hooks (Phase 3) ─────────────────────────
    // await pluginManager.dispatchMessage(sock, ctx);

    return true;
  } catch (e) {
    log.error(`[pipeline] Unhandled error for ${ctx?.messageId}: ${e.message}`);
    return false;
  }
}
