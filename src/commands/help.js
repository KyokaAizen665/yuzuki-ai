/**
 * Command: help / menu
 *
 * VALIDATION PHASE 2 — Hero Image + Caption + Buttons
 *
 * cv3inx native API (no raw:true bypass needed):
 *
 *   sock.sendMessage(jid, {
 *     image:     { url },      ← first if-else: prepareWAMessageMedia → m.imageMessage
 *     caption:   '...',        ← nativeFlow handler: body (not text:) + valid header check
 *     nativeFlow: [...],       ← second if block: prepareNativeFlowButtons
 *     footer:    '...',
 *   })
 *
 * Flow inside generateWAMessageContent:
 *   1. hasNonNullishProperty(message, 'image') → TRUE
 *      → prepareWAMessageMedia({ image: { url } }) → m = { imageMessage: {...} }
 *   2. hasNonNullishProperty(message, 'nativeFlow') → TRUE (separate if block)
 *      → caption branch (no 'text' key): hasValidInteractiveHeader(m) → TRUE (imageMessage set)
 *      → interactiveMessage.header = { hasMediaAttachment: true, ... }
 *      → Object.assign(interactiveMessage.header, m)  ← merges imageMessage into header
 *      → interactiveMessage.body = { text: caption }
 *      → m = { interactiveMessage }
 *
 * Button format (cv3inx high-level, NOT raw proto):
 *   { text: 'label', id: 'payload' }  → quick_reply via prepareNativeFlowButtons
 *
 * Buttons (3 max per phase requirement):
 *   👑 Owner    → id: cmd_owner
 *   📢 Channel  → id: cmd_channel
 *   📋 Help     → id: cmd_help
 */

import { findCommand, getByCategory, getCategoryNames } from '../plugins/registry.js';
import { config } from '../config/index.js';
import {
  sendInteractive,
  quickReply,
} from '../services/rich-messages.js';

export const meta = {
  name:        'help',
  description: 'Browse all commands — interactive category menu',
  category:    'utility',
  aliases:     ['h', 'menu', 'cmds'],
  cooldown:    5,
  owner:       false,
  premium:     false,
  group:       null,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND_FOOTER = '🌸 Yuzuki AI · Powered by cv3inx';

/**
 * Hero image — direct JPEG, HTTP 200, no redirect, no auth.
 * Confirmed working in Phase 1.
 */
const HERO_IMAGE_URL = 'https://www.gstatic.com/webp/gallery/1.jpg';

const CAT_ICONS = {
  ai:      '🤖',
  utility: '🔧',
  owner:   '👑',
  general: '📋',
  fun:     '🎉',
  info:    'ℹ️',
  tools:   '🛠️',
};

function catIcon(cat)    { return CAT_ICONS[cat?.toLowerCase()] ?? '📂'; }
function capitalize(s)   { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function permLabel(m) {
  const flags = [
    m.owner   === true  ? 'owner only'   : null,
    m.premium === true  ? 'premium'      : null,
    m.group   === true  ? 'groups only'  : null,
    m.group   === false ? 'private only' : null,
  ].filter(Boolean);
  return flags.length ? flags.join(' · ') : 'everyone';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { prefix, args, sock, chat: jid, rawMessage } = ctx;
  const query = args[0]?.toLowerCase().trim();

  // ── Detail view (.help <command>) ─────────────────────────────────────────
  // Unchanged — uses sendInteractive (raw:true path, confirmed working).
  if (query) {
    const entry = findCommand(query);
    if (!entry) {
      return sendInteractive(sock, jid, {
        header:  '❌ Command Not Found',
        body:    `No command found for \`${prefix}${query}\`\n\nUse the menu below to browse all available commands.`,
        footer:  BRAND_FOOTER,
        buttons: [quickReply('📋 Open Menu', 'open_menu')],
      }, rawMessage);
    }

    const { meta: m } = entry;
    const aliasText = m.aliases?.length
      ? m.aliases.map(a => `${prefix}${a}`).join(', ')
      : 'none';

    const body =
      `${catIcon(m.category)} *${prefix}${m.name}*\n` +
      `_${m.description ?? 'No description.'}_\n\n` +
      `📂 Category  : ${capitalize(m.category ?? 'general')}\n` +
      `🔗 Aliases   : ${aliasText}\n` +
      `⏱ Cooldown  : ${m.cooldown ?? 0}s\n` +
      `🔐 Access    : ${permLabel(m)}`;

    return sendInteractive(sock, jid, {
      header:  prefix + m.name,
      body,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('📋 Back to Menu', 'back_menu'),
        quickReply(`▶ ${prefix}${m.name}`, `use_${m.name}`),
      ],
    }, rawMessage);
  }

  // ── Full menu (.menu / .help with no args) ─────────────────────────────────
  // Phase 2: Hero Image + Caption + 3 Quick-Reply Buttons
  //
  // Uses cv3inx's native { image, caption, nativeFlow, footer } API.
  // No raw:true — image key is processed first-class in generateWAMessageContent.

  const cats      = getCategoryNames();
  const sections  = cats
    .map(cat => {
      const cmds = getByCategory(cat);
      return cmds.length ? { title: cat, rows: cmds } : null;
    })
    .filter(Boolean);
  const totalCmds = sections.reduce((n, s) => n + s.rows.length, 0);

  const botName = config.botName ?? 'Yuzuki AI';
  const version = config.version ?? '2.0.0';

  // Caption — used as the interactive body (cv3inx: caption key, not text key,
  // because we have an image header; using text: would skip the header path).
  const caption =
    `🌸 *${botName}*  —  v${version}\n\n` +
    `✨ *${totalCmds} commands*  ·  *${sections.length} categories*\n\n` +
    `Type \`${prefix}help <command>\` to see details for any command.`;

  // 3 quick_reply buttons — cv3inx high-level format { text, id }
  // prepareNativeFlowButtons maps { id } → name:'quick_reply' + buttonParamsJson
  const menuButtons = [
    { text: '👑 Owner',   id: 'cmd_owner'   },
    { text: '📢 Channel', id: 'cmd_channel' },
    { text: '📋 Help',    id: 'cmd_help'    },
  ];

  try {
    await sock.sendMessage(
      jid,
      {
        image:     { url: HERO_IMAGE_URL },
        caption,
        nativeFlow: menuButtons,
        footer:    BRAND_FOOTER,
      },
      rawMessage ? { quoted: rawMessage } : {},
    );
  } catch (e) {
    // Graceful plain-text fallback — menu is never silent on error
    const lines = [
      `*${botName}* — Commands\n`,
      ...sections.map(sec => [
        `*${catIcon(sec.title)} ${capitalize(sec.title)}*`,
        ...sec.rows.map(({ meta: m }) =>
          `  ${prefix}${m.name} — ${m.description ?? ''}`),
        '',
      ]).flat(),
      `_Use \`${prefix}help <command>\` for details._\n\n${BRAND_FOOTER}`,
    ];
    await sock.sendMessage(jid, { text: lines.join('\n') },
      rawMessage ? { quoted: rawMessage } : {});
  }
}
