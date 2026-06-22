/**
 * Command Router — Phase 2 (foundation; expanded in Phase 4)
 *
 * Parses the prefix + command name from ctx.body,
 * looks up the command in the plugin registry,
 * and dispatches with a rich command context.
 *
 * Phase 4 will add: cooldowns, permission levels, help generation,
 * aliases, categories, and per-command config. The interface defined
 * here is the contract all future commands must implement.
 */
import { log } from '../utils/logger.js';
import { plugins } from '../plugins/registry.js';
import { config } from '../config/index.js';
import { incrementStat } from '../database/store.js';

/**
 * Build the command execution context exposed to all command handlers.
 */
function buildCmdCtx(sock, ctx, cmdName, args) {
  return {
    // Baileys socket (send messages, etc.)
    sock,

    // Parsed command info
    command: cmdName,
    prefix:  config.prefix,
    args,
    body:    ctx.body,
    fullArgs: args.join(' '),

    // Message context (from serializer)
    ...ctx,

    // Convenience reply helpers (Phase 4 will move these to a rich helper)
    reply: (text, opts = {}) =>
      sock.sendMessage(ctx.chat, { text: String(text), ...opts }, { quoted: ctx.rawMessage }),
    replyMention: (text, jids = [], opts = {}) =>
      sock.sendMessage(ctx.chat, { text: String(text), mentions: jids, ...opts }, { quoted: ctx.rawMessage }),
    react: (emoji) =>
      sock.sendMessage(ctx.chat, { react: { text: emoji, key: ctx.key } }),
  };
}

/**
 * routeCommand(sock, ctx)
 * Extracts the command name, looks it up, and calls it.
 * All errors are caught and logged — never thrown to caller.
 */
export async function routeCommand(sock, ctx) {
  try {
    const body    = ctx.body ?? '';
    const prefix  = config.prefix;

    if (!body.startsWith(prefix)) return;

    const withoutPrefix = body.slice(prefix.length).trim();
    if (!withoutPrefix) return;

    const parts   = withoutPrefix.split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args    = parts.slice(1);

    log.cmd(`[cmd] ${cmdName}(${args.join(' ')}) | ${ctx.sender} in ${ctx.chat}`);

    // Look up command in plugin registry
    // Registry structure: Map<cmdName, { handler, meta }>
    const entry = plugins.get(cmdName);

    if (!entry) {
      log.debug(`[cmd] "${cmdName}" not found`);
      // Optional: send "unknown command" reply — disabled until Phase 4 defines help
      return;
    }

    // Increment command stat
    try { incrementStat('commands_total'); } catch { /* non-critical */ }

    // Build context and execute
    const cmdCtx = buildCmdCtx(sock, ctx, cmdName, args);

    try {
      await entry.handler(cmdCtx);
    } catch (cmdErr) {
      log.error(`[cmd] "${cmdName}" threw: ${cmdErr.message}`);
      try {
        await cmdCtx.reply(`⚠️ An error occurred running \`${prefix}${cmdName}\`.`);
      } catch { /* don't cascade */ }
    }
  } catch (e) {
    log.error(`[cmd:router] ${e.message}`);
  }
}
