/**
 * Command: help / menu
 *
 * Full menu (.menu / .help with no args):
 *   • Hero image    — cv3inx native { image, caption, nativeFlow } API
 *                     Rotates from assets/hero/menu/ or HERO_IMAGE_MENU_URL env var.
 *   • Caption       — Time-aware greeting + experience-first category overview.
 *                     No command walls. Presents experiences, not raw commands.
 *   • Offer card    — cv3inx native offerText/offerUrl/offerCode/offerExpiration
 *                     Renders as native WhatsApp offer UI. Disabled when
 *                     MENU_OFFER_TEXT is unset.
 *   • 3 buttons     — AI Chat | Bot Info | Owner  (navigation via button.js)
 *   • Footer        — "Yuzuki AI • Powered by cv3inx"
 *
 * Detail view (.help <command>):
 *   • sendInteractive with command metadata + back/run buttons
 *
 * Offer overlay config (all optional, all in .env):
 *   MENU_OFFER_TEXT   — offer title (leave empty = no card)
 *   MENU_OFFER_URL    — tap URL
 *   MENU_OFFER_CODE   — promo/copy code shown as "Code: …"
 *   MENU_OFFER_EXPIRY — unix timestamp (seconds) shown as "Ends on …"
 *
 * Hero image config (all optional):
 *   assets/hero/menu/  — drop any .jpg/.png/.webp here; rotates randomly
 *   HERO_IMAGE_MENU_URL — fallback URL when no local files are present
 */

import { findCommand, getByCategory, getCategoryNames } from '../plugins/registry.js';
import { config }                from '../config/index.js';
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { getRandomHeroImage }    from '../services/hero-images.js';

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

// ── Brand ─────────────────────────────────────────────────────────────────────
const BRAND_FOOTER = 'Yuzuki AI • Powered by cv3inx';

// ── Experience categories ─────────────────────────────────────────────────────
// Presented as experiences, not command dumps.
const EXPERIENCES = [
  { icon: '🧠', label: 'AI Assistant', desc: 'Chat, translate, summarise, and more'   },
  { icon: '📥', label: 'Media Hub',    desc: 'YouTube, TikTok, Instagram, Twitter'    },
  { icon: '🔍', label: 'Discovery',    desc: 'Web search, Wikipedia, YouTube search'  },
  { icon: '⚙️', label: 'Utilities',    desc: 'Polls, reactions, and quick tools'      },
  { icon: '👤', label: 'Support',      desc: 'Owner contact and help'                 },
];

// ── Time-aware greeting ───────────────────────────────────────────────────────
function getGreeting(name) {
  const hour = new Date().getHours();
  const hi   = name ? `, ${name}` : '';
  if (hour >= 5  && hour < 12) return `Good morning${hi}. Your assistant is ready.`;
  if (hour >= 12 && hour < 17) return `Good afternoon${hi}. What would you like to do today?`;
  if (hour >= 17 && hour < 21) return `Good evening${hi}. Explore AI, media, and more.`;
  return `Welcome back${hi}. Your assistant is ready.`;
}

// ── Category icons (detail view) ──────────────────────────────────────────────
const CAT_ICONS = {
  ai:          '🧠',
  utility:     '⚙️',
  owner:       '👑',
  general:     '📋',
  fun:         '🎉',
  info:        'ℹ️',
  tools:       '🛠️',
  downloader:  '📥',
  search:      '🔍',
  media:       '🎬',
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
  const { prefix, args, sock, chat: jid, rawMessage, pushName } = ctx;
  const query = args[0]?.toLowerCase().trim();

  // ── Detail view: .help <command> ──────────────────────────────────────────
  if (query) {
    const entry = findCommand(query);

    if (!entry) {
      return sendInteractive(sock, jid, {
        header:  'Not Found',
        body:    `No command matched \`${prefix}${query}\`.\n\nUse the menu to browse available commands.`,
        footer:  BRAND_FOOTER,
        buttons: [quickReply('← Open Menu', 'open_menu')],
      }, rawMessage);
    }

    const { meta: m } = entry;
    const aliasText = m.aliases?.length
      ? m.aliases.map(a => `${prefix}${a}`).join(', ')
      : 'none';

    const body =
      `${catIcon(m.category)} *${prefix}${m.name}*\n` +
      `_${m.description ?? 'No description.'}_\n\n` +
      `Category  : ${capitalize(m.category ?? 'general')}\n` +
      `Aliases   : ${aliasText}\n` +
      `Cooldown  : ${m.cooldown ?? 0}s\n` +
      `Access    : ${permLabel(m)}`;

    return sendInteractive(sock, jid, {
      header:  `${prefix}${m.name}`,
      body,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('← Back to Menu', 'back_menu'),
        quickReply(`▶ Run ${prefix}${m.name}`, `use_${m.name}`),
      ],
    }, rawMessage);
  }

  // ── Full menu: .menu / .help ───────────────────────────────────────────────

  const cats      = getCategoryNames();
  const totalCmds = cats.reduce((n, cat) => n + getByCategory(cat).length, 0);
  const botName   = config.botName ?? 'Yuzuki AI';
  const version   = config.version ?? '2.0.0';

  // Experience-first caption — breathable, no command walls
  const experienceLines = EXPERIENCES
    .map(e => `${e.icon} *${e.label}*\n_${e.desc}_`)
    .join('\n\n');

  // ── Footer info section ───────────────────────────────────────────────────
  // Shows a compact category breakdown beneath the experience list.
  const catLines = cats
    .filter(c => c !== 'owner') // hide owner category from public menu
    .map(c => {
      const count = getByCategory(c).length;
      return `${catIcon(c)} ${capitalize(c)}: ${count}`;
    })
    .join('  ·  ');

  const fullCaption =
    `${getGreeting(pushName)}\n\n` +
    `${experienceLines}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${catLines}\n` +
    `_${totalCmds} total commands  ·  v${version}_`;

  // Navigation buttons — 3 most-used entry points
  const menuButtons = [
    { text: '🧠 AI Chat',  id: 'cmd_ai'    },
    { text: '📥 Download', id: 'cmd_dl'    },
    { text: '🔍 Search',   id: 'cmd_search'},
  ];

  const heroImage   = getRandomHeroImage('menu');
  const offerFields = buildOfferFields();

  try {
    await sock.sendMessage(
      jid,
      {
        image:      heroImage,
        caption:    fullCaption,
        nativeFlow: menuButtons,
        footer:     BRAND_FOOTER,
        ...(offerFields ?? {}),
      },
      rawMessage ? { quoted: rawMessage } : {},
    );
  } catch {
    // Plain-text fallback — menu never goes silent
    const lines = [
      `*${botName}*  ·  v${version}\n`,
      getGreeting(pushName),
      '',
      ...EXPERIENCES.map(e => `${e.icon} *${e.label}* — ${e.desc}`),
      '',
      `${catLines}`,
      `_${totalCmds} commands total_`,
      '',
      `_Type \`${prefix}help <command>\` for details._`,
    ];
    await sock.sendMessage(
      jid,
      { text: lines.join('\n') },
      rawMessage ? { quoted: rawMessage } : {},
    );
  }
}
