/**
 * Command Router — Phase 4 + Permission Denied Renderer integration
 *
 * Full dispatch pipeline with permission middleware and cooldown enforcement.
 *
 * Execution order for every prefixed message:
 *   1. Parse  — extract prefix, command name, args
 *   2. Resolve — look up entry by name or alias
 *   3. Permissions — ban / publicMode / owner / premium / group-DM
 *   4. Cooldown — check remaining TTL (owner always exempt)
 *   5. Execute — call handler with rich cmdCtx
 *   6. Post — set cooldown on success, increment stat
 *
 * Nothing in this file throws to its caller. All errors are caught and logged.
 */
import { createRequire }  from 'module';
import { log }            from '../utils/logger.js';
import { findCommand }    from '../plugins/registry.js';
import { config }         from '../config/index.js';
import { incrementStat }  from '../database/store.js';
import {
  checkPermission,
  checkCooldown,
  setCooldown,
  isOwner,
  isPremium,
} from './permissions.js';
import { renderPermissionDenied } from '../services/permission-denied.js';

// ── Baileys require helper ────────────────────────────────────────────────────
// Resolved once at module load — avoids dynamic await import inside sync arrow fns.
const _req2 = createRequire(import.meta.url);

// ── Level resolver (mirrors permissions.js resolveLevel — no circular import) ──

/**
 * resolveRequiredLevel(meta) → string
 *
 * Reads meta.permission first, then falls back to the legacy boolean triplet.
 * Must stay in sync with resolveLevel() in permissions.js.
 */
function resolveRequiredLevel(meta) {
  if (meta.permission) return meta.permission;
  if (meta.owner   === true)  return 'owner';
  if (meta.premium === true)  return 'premium';
  if (meta.group   === true)  return 'group';
  if (meta.group   === false) return 'private';
  return 'public';
}

/**
 * resolveUserLevel(sender) → string
 *
 * Best-effort sync determination of the caller's highest effective level.
 * Admin / groupOwner resolution is async (requires groupMetadata) and is
 * intentionally skipped here — the card is accurate for the most common cases.
 */
function resolveUserLevel(sender) {
  if (isOwner(sender))   return 'owner';
  if (isPremium(sender)) return 'premium';
  return 'user';
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build the cmdCtx object given to every command handler.
 *
 * Extends the message ctx with:
 *   - command, prefix, args, fullArgs
 *   - isOwner flag (pre-computed so handlers don't need to re-check)
 *   - reply(), replyMention(), react(), send() helpers
 */
function buildCmdCtx(sock, ctx, resolvedName, args) {
  const owner = isOwner(ctx.sender);

  return {
    // Socket (for advanced Baileys operations)
    sock,

    // Command metadata
    command:  resolvedName,
    prefix:   config.prefix,
    args,
    fullArgs: args.join(' '),

    // Full normalized message context (sender, chat, body, media, quoted …)
    ...ctx,

    // Caller flags
    isOwner: owner,

    // ── Reply helpers ────────────────────────────────────────────────────────

    /** Reply quoting the triggering message — includes externalAdReply branding */
    reply: (text, opts = {}) => {
      try {
        const { proto, generateWAMessageFromContent } =
          (() => { try { return _req2('baileys'); } catch { return null; } })() ?? {};
        if (proto && generateWAMessageFromContent) {
          const adReply = proto.ContextInfo.ExternalAdReplyInfo.create({
            title: 'Yuzuki AI', body: '', renderLargerThumbnail: false,
            showAdAttribution: false, mediaType: 1, sourceUrl: 'https://wa.me',
          });
          const msg = generateWAMessageFromContent(
            ctx.chat,
            { extendedTextMessage: proto.Message.ExtendedTextMessage.create({
                text: String(text),
                contextInfo: proto.ContextInfo.create({ externalAdReply: adReply }),
              }),
            },
            { userJid: sock.user?.id, quoted: ctx.rawMessage },
          );
          return sock.relayMessage(ctx.chat, msg.message, { messageId: msg.key.id });
        }
      } catch { /* fall through */ }
      return sock.sendMessage(
        ctx.chat,
        { text: String(text), ...opts },
        { quoted: ctx.rawMessage },
      );
    },

    /** Reply with @-mentions */
    replyMention: (text, jids = [], opts = {}) =>
      sock.sendMessage(
        ctx.chat,
        { text: String(text), mentions: jids, ...opts },
        { quoted: ctx.rawMessage },
      ),

    /** React to the triggering message */
    react: (emoji) =>
      sock.sendMessage(ctx.chat, { react: { text: emoji, key: ctx.key } }),

    /** Send without quoting */
    send: (content, opts = {}) =>
      sock.sendMessage(ctx.chat, { ...content, ...opts }),
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * routeCommand(sock, ctx) — async, never throws.
 *
 * Called by the message pipeline (handlers/message.js) for every
 * message whose body starts with the configured prefix.
 *
 * Also called by:
 *   - button.js  (routeButtonResponse → routeCommand with synthetic body)
 *   - sticker command path (normalized body passed through as-is)
 *
 * Permission denials from any of those call sites are rendered by
 * renderPermissionDenied() — a rich interactive card matching the menu style,
 * with a formatted-text fallback if the card path fails.
 */
export async function routeCommand(sock, ctx) {
  try {
    const body   = ctx.body ?? '';
    const prefix = config.prefix;

    if (!body.startsWith(prefix)) return;

    const withoutPrefix = body.slice(prefix.length).trim();
    if (!withoutPrefix) return;

    const parts     = withoutPrefix.split(/\s+/);
    const inputName = parts[0].toLowerCase();
    const args      = parts.slice(1);

    // ── Step 1: resolve (name + alias) ────────────────────────────────────
    const entry = findCommand(inputName);
    if (!entry) {
      log.debug(`[cmd] "${inputName}" — not found`);
      return;
    }

    const { meta } = entry;
    const resolvedName = meta.name;

    log.cmd(`[cmd] ${resolvedName}(${args.join(' ')}) | ${ctx.sender} in ${ctx.chat}`);

    // ── Step 2: permission check (unified — covers text, sticker, button) ──
    const perm = await checkPermission(meta, ctx, sock);
    if (!perm.allowed) {
      log.warn(`[cmd:deny] ${resolvedName} → ${ctx.sender} — ${perm.reason}`);

      // Render the rich Permission Denied card.
      // renderPermissionDenied never throws — it has its own text fallback.
      await renderPermissionDenied(sock, ctx.chat, ctx.rawMessage, {
        commandName:   resolvedName,
        requiredLevel: resolveRequiredLevel(meta),
        userLevel:     resolveUserLevel(ctx.sender),
        reason:        perm.reason,
      });
      return;
    }

    // ── Step 3: cooldown check ─────────────────────────────────────────────
    const cd = checkCooldown(resolvedName, ctx.sender, meta);
    if (cd.onCooldown) {
      log.debug(`[cmd:cd] ${resolvedName} → ${ctx.sender}: ${cd.remaining}s`);
      try {
        await sock.sendMessage(
          ctx.chat,
          { text: `⏳ Please wait *${cd.remaining}s* before using \`${prefix}${resolvedName}\` again.` },
          { quoted: ctx.rawMessage },
        );
      } catch { /* best-effort */ }
      return;
    }

    // ── Step 4: execute ────────────────────────────────────────────────────
    const cmdCtx  = buildCmdCtx(sock, ctx, resolvedName, args);
    let   success = false;

    try {
      await entry.handler(cmdCtx);
      success = true;
    } catch (cmdErr) {
      log.error(`[cmd] "${resolvedName}" threw: ${cmdErr.message}`);
      try {
        await cmdCtx.reply(`⚠️ An error occurred running \`${prefix}${resolvedName}\`.`);
      } catch { /* don't cascade */ }
    }

    // ── Step 5: post-dispatch ──────────────────────────────────────────────
    if (success) {
      // Set cooldown only after a clean execution
      setCooldown(resolvedName, ctx.sender, meta.cooldown ?? 0);
      // Increment global command stat (non-critical)
      try { incrementStat('commands_total'); } catch { /* ignore */ }
    }
  } catch (e) {
    log.error(`[cmd:router] Unhandled error: ${e.message}`);
  }
}
