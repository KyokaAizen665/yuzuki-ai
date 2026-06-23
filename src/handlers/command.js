/**
 * Command Router — Phase 3
 *
 * Parses prefix + command name from ctx.body, resolves the command
 * (including aliases) from the plugin registry, and dispatches with
 * a rich command context.
 *
 * Phase 4 will add: cooldown enforcement, permission middleware,
 * and per-command config validation.
 */
import { log } from '../utils/logger.js';
import { findCommand } from '../plugins/registry.js';
import { config } from '../config/index.js';
import { incrementStat } from '../database/store.js';

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build the cmdCtx object that every command handler receives.
 * Extends the message ctx with command-specific helpers.
 */
function buildCmdCtx(sock, ctx, resolvedName, args) {
  return {
    // Baileys socket — for advanced use
    sock,

    // Command info
    command:  resolvedName,
    prefix:   config.prefix,
    args,
    fullArgs: args.join(' '),

    // Full message context (sender, chat, body, media, quoted, etc.)
    ...ctx,

    // ── Reply helpers ────────────────────────────────────────────────────────

    /** Send a plain-text reply quoting the triggering message */
    reply: (text, opts = {}) =>
      sock.sendMessage(
        ctx.chat,
        { text: String(text), ...opts },
        { quoted: ctx.rawMessage },
      ),

    /** Reply with mentions */
    replyMention: (text, jids = [], opts = {}) =>
      sock.sendMessage(
        ctx.chat,
        { text: String(text), mentions: jids, ...opts },
        { quoted: ctx.rawMessage },
      ),

    /** React to the triggering message with an emoji */
    react: (emoji) =>
      sock.sendMessage(ctx.chat, { react: { text: emoji, key: ctx.key } }),

    /** Send a message to the same chat (no quote) */
    send: (content, opts = {}) =>
      sock.sendMessage(ctx.chat, { ...content, ...opts }),
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * routeCommand(sock, ctx)
 *
 * Entry point called by the message pipeline for every prefixed message.
 * All errors are caught here — this function never throws to its caller.
 */
export async function routeCommand(sock, ctx) {
  try {
    const body   = ctx.body ?? '';
    const prefix = config.prefix;

    if (!body.startsWith(prefix)) return;

    const withoutPrefix = body.slice(prefix.length).trim();
    if (!withoutPrefix) return;

    const parts       = withoutPrefix.split(/\s+/);
    const inputName   = parts[0].toLowerCase();
    const args        = parts.slice(1);

    // Resolve via registry (supports aliases)
    const entry = findCommand(inputName);

    if (!entry) {
      log.debug(`[cmd] "${inputName}" — not found`);
      return;
    }

    const resolvedName = entry.meta.name;
    log.cmd(`[cmd] ${resolvedName}(${args.join(' ')}) | ${ctx.sender} → ${ctx.chat}`);

    // Non-critical stat
    try { incrementStat('commands_total'); } catch { /* ignore */ }

    // Build context and execute
    const cmdCtx = buildCmdCtx(sock, ctx, resolvedName, args);

    try {
      await entry.handler(cmdCtx);
    } catch (cmdErr) {
      log.error(`[cmd] "${resolvedName}" threw: ${cmdErr.message}`);
      try {
        await cmdCtx.reply(`⚠️ An error occurred running \`${prefix}${resolvedName}\`.`);
      } catch { /* don't cascade */ }
    }
  } catch (e) {
    log.error(`[cmd:router] ${e.message}`);
  }
}
