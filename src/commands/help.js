/**
 * Command: help / menu
 *
 * VALIDATION PHASE — Hero Image Layer
 * Full menu (.menu / .help with no args) sends:
 *   • Hero image  (cv3inx image handler — NOT raw proto, no raw:true needed)
 *   • Caption     (bot name, command count, usage hint)
 *
 * No buttons, no NativeFlow, no list, no interactive elements.
 * Confirms cv3inx image pipeline works before layering interactive UI.
 *
 * Detail view (.help <command>) is unchanged — still uses sendInteractive.
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
 * Hero image for the menu — direct JPEG, no redirect, no auth.
 * Fetched by cv3inx's prepareWAMessageMedia via the `image` handler
 * (NOT the else-catch-all that caused "Invalid media type").
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

function catIcon(cat) {
  return CAT_ICONS[cat?.toLowerCase()] ?? '📂';
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

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
  // Unchanged from original — validates sendInteractive separately.
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

  // ── Full menu (.menu / .help with no args) ────────────────────────────────
  // VALIDATION PHASE: hero image + caption only.
  // cv3inx handles { image: { url } } via its dedicated image branch in
  // generateWAMessageContent → prepareWAMessageMedia({ image: ... }) → no error.

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

  const caption =
    `🌸 *${botName}*  —  v${version}\n\n` +
    `✨ *${totalCmds} commands*  ·  *${sections.length} categories*\n\n` +
    `Type \`${prefix}help <command>\` to see details for any command.\n\n` +
    `${BRAND_FOOTER}`;

  try {
    await sock.sendMessage(
      jid,
      {
        image:   { url: HERO_IMAGE_URL },
        caption,
      },
      rawMessage ? { quoted: rawMessage } : {},
    );
  } catch (e) {
    // Graceful plain-text fallback so the menu is never silent
    const lines = [
      `*${botName}* — Commands\n`,
      ...sections.map(sec => [
        `*${catIcon(sec.title)} ${capitalize(sec.title)}*`,
        ...sec.rows.map(({ meta: m }) => `  ${prefix}${m.name} — ${m.description ?? ''}`),
        '',
      ]).flat(),
      `_Use \`${prefix}help <command>\` for details._\n\n${BRAND_FOOTER}`,
    ];
    await sock.sendMessage(jid, { text: lines.join('\n') });
  }
}
