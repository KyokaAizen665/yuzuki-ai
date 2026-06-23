/**
 * Command: help / menu
 *
 * Full menu (.menu / .help with no args):
 *   • Hero image   — cv3inx native { image, caption, nativeFlow } API
 *   • Caption      — botName · version · command count
 *   • Offer card   — cv3inx native offerText/offerUrl/offerCode/offerExpiration
 *                    Renders as native WhatsApp offer UI (tag icon, title,
 *                    "Ends on…", "Code:…"). Disabled when MENU_OFFER_TEXT is empty.
 *   • 3 buttons    — Owner | Channel | Help  (quick_reply, routed via button.js)
 *   • Footer       — concise brand string, renders on all clients
 *
 * Detail view (.help <command>):
 *   • sendInteractive with command metadata + back/run buttons
 *
 * Offer overlay config (all optional, all in .env):
 *   MENU_OFFER_TEXT   — offer title (leave empty = no card)
 *   MENU_OFFER_URL    — tap URL
 *   MENU_OFFER_CODE   — promo/copy code shown as "Code: …"
 *   MENU_OFFER_EXPIRY — unix timestamp (seconds) shown as "Ends on …"
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

// ── Brand footer ──────────────────────────────────────────────────────────────
// Concise, no implementation details. Renders correctly on all WhatsApp clients.
// WhatsApp truncates footer text after ~60 chars — keep it short.
const BRAND_FOOTER = `🌸 ${config.botName ?? 'Yuzuki AI'}`;

// ── Hero image ────────────────────────────────────────────────────────────────
// Direct JPEG, HTTP 200, no redirect, no auth. Validated in Phase 1.
const HERO_IMAGE_URL = 'https://www.gstatic.com/webp/gallery/1.jpg';

// ── Category icons ────────────────────────────────────────────────────────────
const CAT_ICONS = {
  ai:      '🤖',
  utility: '🔧',
  owner:   '👑',
  general: '📋',
  fun:     '🎉',
  info:    'ℹ️',
  tools:   '🛠️',
};

function catIcon(cat)  { return CAT_ICONS[cat?.toLowerCase()] ?? '📂'; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function permLabel(m) {
  const flags = [
    m.owner   === true  ? 'owner only'   : null,
    m.premium === true  ? 'premium'      : null,
    m.group   === true  ? 'groups only'  : null,
    m.group   === false ? 'private only' : null,
  ].filter(Boolean);
  return flags.length ? flags.join(' · ') : 'everyone';
}

// ── Offer overlay helper ──────────────────────────────────────────────────────
/**
 * buildOfferFields() → object | null
 *
 * Returns cv3inx native offer fields when MENU_OFFER_TEXT is configured,
 * or null when the offer card is disabled.
 *
 * cv3inx reads these from the top-level message object in prepareNativeFlowButtons:
 *   offerText       → limited_time_offer.text
 *   offerUrl        → limited_time_offer.url
 *   offerCode       → limited_time_offer.copy_code  (shown as "Code: …")
 *   offerExpiration → limited_time_offer.expiration_time (shown as "Ends on …")
 *
 * Never throws — returns null on any error.
 */
function buildOfferFields() {
  try {
    const text = (config.menuOfferText ?? '').trim();
    if (!text) return null;

    const fields = { offerText: text };

    const url = (config.menuOfferUrl ?? '').trim();
    if (url) fields.offerUrl = url;

    const code = (config.menuOfferCode ?? '').trim();
    if (code) fields.offerCode = code;

    const expiry = (config.menuOfferExpiry ?? '').trim();
    if (expiry) {
      const ts = Number(expiry);
      if (Number.isFinite(ts) && ts > 0) fields.offerExpiration = ts;
    }

    return fields;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { prefix, args, sock, chat: jid, rawMessage } = ctx;
  const query = args[0]?.toLowerCase().trim();

  // ── Detail view (.help <command>) ─────────────────────────────────────────
  if (query) {
    const entry = findCommand(query);
    if (!entry) {
      return sendInteractive(sock, jid, {
        header:  '❌ Not Found',
        body:    `No command found for \`${prefix}${query}\`.\n\nUse the menu to browse all available commands.`,
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
      header:  `${prefix}${m.name}`,
      body,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('📋 Back to Menu', 'back_menu'),
        quickReply(`▶ Run ${prefix}${m.name}`, `use_${m.name}`),
      ],
    }, rawMessage);
  }

  // ── Full menu (.menu / .help with no args) ─────────────────────────────────
  //
  // cv3inx native API: { image, caption, nativeFlow, footer, ...offerFields }
  //
  // Assembly path in cv3inx generateWAMessageContent:
  //   1. image key → prepareWAMessageMedia → m = { imageMessage }
  //   2. nativeFlow → prepareNativeFlowButtons(message):
  //        • reads offerText/offerUrl/offerCode/offerExpiration from message
  //        • builds limited_time_offer block inside nativeFlowMessage.messageParamsJson
  //   3. caption → interactiveMessage.body = { text: caption }
  //   4. Object.assign(interactiveMessage.header, m)  ← merges imageMessage
  //   5. footer  → interactiveMessage.footer = { text: footer }
  //
  // Button IDs (cmd_owner, cmd_channel, cmd_help) are routed by handlers/button.js.

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
    `✨ *${totalCmds} commands*  ·  *${sections.length} categories*\n` +
    `Type \`${prefix}help <command>\` to see details.`;

  // 3 quick_reply buttons — cv3inx { text, id } format
  const menuButtons = [
    { text: '👑 Owner',   id: 'cmd_owner'   },
    { text: '📢 Channel', id: 'cmd_channel' },
    { text: '📋 Help',    id: 'cmd_help'    },
  ];

  // Native offer card — injected only when configured
  const offerFields = buildOfferFields();

  try {
    await sock.sendMessage(
      jid,
      {
        image:      { url: HERO_IMAGE_URL },
        caption,
        nativeFlow: menuButtons,
        footer:     BRAND_FOOTER,
        // Spread offer fields at top level — cv3inx reads them in prepareNativeFlowButtons
        ...(offerFields ?? {}),
      },
      rawMessage ? { quoted: rawMessage } : {},
    );
  } catch (e) {
    // Plain-text fallback — menu never goes silent
    const lines = [
      `*${botName}* — Commands\n`,
      ...sections.map(sec => [
        `*${catIcon(sec.title)} ${capitalize(sec.title)}*`,
        ...sec.rows.map(({ meta: m }) =>
          `  ${prefix}${m.name} — ${m.description ?? ''}`),
        '',
      ]).flat(),
      `_Use \`${prefix}help <command>\` for details._`,
    ];
    await sock.sendMessage(
      jid,
      { text: lines.join('\n') },
      rawMessage ? { quoted: rawMessage } : {},
    );
  }
}
