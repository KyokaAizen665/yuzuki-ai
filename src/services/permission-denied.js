/**
 * Permission Denied Renderer — Yuzuki AI
 *
 * Single reusable helper for every interaction type that hits a permission wall:
 *   text commands · sticker commands · button commands · future interaction types
 *
 * Rendering style matches the Yuzuki menu (sendInteractiveWithImage / cv3inx
 * nativeFlow path). Falls back to a formatted text card if the rich path fails.
 *
 * Public API:
 *   renderPermissionDenied(sock, jid, rawMessage, opts) → Promise<void>
 *
 * @param {object} sock         — Baileys socket
 * @param {string} jid          — destination JID (chat)
 * @param {object} rawMessage   — original message (for quoting)
 * @param {object} opts
 * @param {string} opts.commandName    — blocked command name (without prefix)
 * @param {string} opts.requiredLevel  — permission level the command requires
 * @param {string} opts.userLevel      — caller's current effective level
 * @param {string} [opts.reason]       — optional human-readable override reason
 */

import { sendInteractive, quickReply } from './rich-messages.js';
import { getRandomHeroImage }                   from './hero-images.js';
import { config }                               from '../config/index.js';
import { log }                                  from '../utils/logger.js';

// ── Brand ─────────────────────────────────────────────────────────────────────

const BRAND_FOOTER = 'Yuzuki AI • Powered by cv3inx';

// ── Level display metadata ────────────────────────────────────────────────────

/**
 * Human-readable label and icon for each permission level.
 * Used in both the Required Role and Your Role lines.
 */
const LEVEL_META = {
  owner:      { icon: '🔒', label: 'Owner'       },
  admin:      { icon: '🛡️', label: 'Admin'        },
  premium:    { icon: '💎', label: 'Premium'      },
  groupOwner: { icon: '👑', label: 'Group Owner'  },
  group:      { icon: '👥', label: 'Group Member' },
  private:    { icon: '💬', label: 'Private Chat' },
  public:     { icon: '🌐', label: 'Public'       },
  user:       { icon: '👤', label: 'User'         },
};

/** Resolve display meta for any level string, with safe fallback. */
function levelMeta(level) {
  return LEVEL_META[level] ?? { icon: '🚫', label: level ?? 'Unknown' };
}

// ── Default deny reasons ──────────────────────────────────────────────────────

const DEFAULT_REASONS = {
  owner:      'This command is reserved for the bot owner only.',
  admin:      'You must be a group admin to use this command.',
  groupOwner: 'You must be the group creator to use this command.',
  premium:    'This command requires a Premium subscription.',
  group:      'This command can only be used inside a group chat.',
  private:    'This command can only be used in a private chat.',
  publicMode: 'The bot is currently in private mode.',
  banned:     'You are banned from using this bot.',
};

function defaultReason(requiredLevel) {
  return DEFAULT_REASONS[requiredLevel]
    ?? 'You do not have sufficient privileges to execute this command.';
}

// ── Body builder ──────────────────────────────────────────────────────────────

/**
 * buildBody(opts) → string
 *
 * Constructs the card body in the same structured format as the help/menu cards.
 * Uses WhatsApp markdown: *bold*, _italic_.
 */
function buildBody({ commandName, requiredLevel, userLevel, reason }) {
  const prefix   = config.prefix ?? '.';
  const required = levelMeta(requiredLevel);
  const current  = levelMeta(userLevel);
  const body     = reason ?? defaultReason(requiredLevel);

  return (
    `*Command   :* \`${prefix}${commandName}\`\n` +
    `*Required  :* ${required.icon} ${required.label}\n` +
    `*Your Role :* ${current.icon} ${current.label}\n` +
    `\n` +
    `${body}`
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────────

/**
 * renderPermissionDenied(sock, jid, rawMessage, opts) → Promise<void>
 *
 * Sends a rich interactive denial card.
 * Falls back to a formatted text message if the card path fails.
 *
 * Button routing re-uses the standard button IDs already wired in button.js:
 *   open_menu  → .help         (Main Menu)
 *   cmd_help   → .help         (Help)
 *   use_owner  → .owner        (Contact Owner)
 */
export async function renderPermissionDenied(sock, jid, rawMessage, opts) {
  const {
    commandName  = '?',
    requiredLevel = 'owner',
    userLevel    = 'user',
    reason,
  } = opts ?? {};

  const body    = buildBody({ commandName, requiredLevel, userLevel, reason });
  const cardOpts = {
    contextImage: getRandomHeroImage('owner'),
    header:  '🚫 Access Denied',
    body,
    footer:  BRAND_FOOTER,
    buttons: [
      quickReply('📋 Main Menu',     'open_menu'),
      quickReply('❓ Help',           'cmd_help'),
      quickReply('📞 Contact Owner', 'use_owner'),
    ],
  };

  try {
    await sendInteractive(
      sock,
      jid,
      cardOpts,
      rawMessage ?? undefined,
    );
    log.debug(
      `[perm-denied] rendered card for ${jid}` +
      ` cmd=${commandName} required=${requiredLevel} user=${userLevel}`,
    );
  } catch (richErr) {
    // ── Text fallback — denial response must never go silent ──────────────
    log.warn(`[perm-denied] rich card failed (${richErr.message}) — text fallback`);

    const prefix   = config.prefix ?? '.';
    const required = levelMeta(requiredLevel);
    const current  = levelMeta(userLevel);
    const message  = reason ?? defaultReason(requiredLevel);

    const fallbackText = [
      `🚫 *Access Denied*`,
      ``,
      `Command   : \`${prefix}${commandName}\``,
      `Required  : ${required.icon} ${required.label}`,
      `Your Role : ${current.icon} ${current.label}`,
      ``,
      message,
      ``,
      `_Type \`${prefix}help\` to browse available commands._`,
    ].join('\n');

    try {
      await sock.sendMessage(
        jid,
        { text: fallbackText },
        rawMessage ? { quoted: rawMessage } : {},
      );
    } catch (textErr) {
      log.error(`[perm-denied] text fallback also failed: ${textErr.message}`);
    }
  }
}
