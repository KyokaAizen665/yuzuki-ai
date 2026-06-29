/**
 * Command: help / menu
 *
 * Full menu (.menu / .help with no args):
 *   • Hero image    — cv3inx native { image, caption, nativeFlow } API
 *                     Rotates from assets/heroes/ via HeroManager.
 *   • Caption       — Time-aware greeting + experience-first category overview.
 *                     No command walls. Presents experiences, not raw commands.
 *   • Offer card    — cv3inx native offerText/offerUrl/offerCode/offerExpiration
 *                     Renders as native WhatsApp offer UI. Disabled when
 *                     MENU_OFFER_TEXT is unset.
 *   • 1 singleSelect — "📋 Quick Start" picker with AI / All Commands / Downloader rows
 *   • Footer        — shared BRAND_FOOTER from services/brand.js
 *
 * Detail view (.help <command>):
 *   • sendInteractive with command metadata + back/run buttons
 *
 * Hero image config:
 *   assets/heroes/          — drop .jpg/.png/.webp here; rotates randomly
 *   MENU_HERO_MODE=random   random rotation (default)
 *   MENU_HERO_MODE=static   always use MENU_HERO_IMAGE
 *   MENU_HERO_IMAGE=hero-1.jpg
 *
 * Offer overlay config (all optional, all in .env):
 *   MENU_OFFER_TEXT   — offer title (leave empty = no card)
 *   MENU_OFFER_URL    — tap URL
 *   MENU_OFFER_CODE   — promo/copy code shown as "Code: …"
 *   MENU_OFFER_EXPIRY — unix timestamp (seconds) shown as "Ends on …"
 */

import { findCommand, getByCategory, getCategoryNames } from '../plugins/registry.js';
import { config }                                        from '../config/index.js';
import { sendInteractive, quickReply, singleSelect }      from '../services/rich-messages.js';
import { getHeroImage }                                  from '../services/ui/HeroManager.js';
import { BRAND_FOOTER }                                  from '../services/brand.js';

export const meta = {
  name:        'help',
  description: 'Browse all commands — interactive category menu',
  category:    'utility',
  aliases:     ['h', 'menu', 'cmds'],
  cooldown:    5,
  permission:  'public',
};

// ── Experience categories ─────────────────────────────────────────────────────
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
  if (hour >= 5  && hour < 12) return `ɢᴏᴏᴅ ᴍᴏʀɴɪɴɢ${hi}.`;
  if (hour >= 12 && hour < 17) return `ɢᴏᴏᴅ ᴀꜰᴛᴇʀɴᴏᴏɴ${hi}.`;
  if (hour >= 17 && hour < 21) return `ɢᴏᴏᴅ ᴇᴠᴇɴɪɴɢ${hi}.`;
  return `ʜᴇʟʟᴏ${hi}.`;
}

// ── Category icons (detail view) ──────────────────────────────────────────────
const CAT_ICONS = {
  ai:         '🧠',
  utility:    '⚙️',
  owner:      '👑',
  general:    '📋',
  fun:        '🎉',
  info:       'ℹ️',
  tools:      '🛠️',
  downloader: '📥',
  search:     '🔍',
  media:      '🎬',
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

// ── Time-aware offer greeting ─────────────────────────────────────────────────
function getOfferGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return '🌅 Good morning!';
  if (h >= 12 && h < 17) return '☀️ Good afternoon!';
  if (h >= 17 && h < 21) return '🌙 Good evening!';
  return '🌙 Hello!';
}

// ── Offer overlay helper ──────────────────────────────────────────────────────
function buildOfferFields() {
  try {
    const text = (config.menuOfferText ?? '').trim();
    if (!text) return null;

    // Prefix the stored offer text with a time-aware greeting so every
    // menu open greets the user with morning / afternoon / evening automatically.
    const fields = { offerText: `${getOfferGreeting()} ${text}` };

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
        header:  '◆ ɴᴏᴛ ꜰᴏᴜɴᴅ',
        body:    `No command matched \`${prefix}${query}\`.\n\n▸ Use \`${prefix}allmenu\` to browse.`,
        footer:  BRAND_FOOTER,
        buttons: [quickReply('← Menu', 'open_menu')],
      }, rawMessage);
    }

    const { meta: m } = entry;
    const aliasText = m.aliases?.length
      ? m.aliases.map(a => `\`${prefix}${a}\``).join('  ')
      : '—';

    const body =
      `◆ \`${prefix}${m.name}\`\n` +
      `_${m.description ?? ''}_\n\n` +
      `ᴄᴀᴛ  ${capitalize(m.category ?? 'general')}\n` +
      `ᴀᴋᴀ  ${aliasText}\n` +
      `ᴀᴄᴄ  ${permLabel(m)}`;

    return sendInteractive(sock, jid, {
      header:  `${prefix}${m.name}`,
      body,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('← ᴍᴇɴᴜ', 'back_menu'),
        quickReply(`▸ ʀᴜɴ ${prefix}${m.name}`, `use_${m.name}`),
      ],
    }, rawMessage);
  }

  // ── Full menu: .menu / .help ───────────────────────────────────────────────

  const version = config.version ?? '2.0.0';
  const p       = config.prefix  ?? '.';

  const fullCaption =
    `╭──────────────────╮\n` +
    `  🌸 ʏᴜᴢᴜᴋɪ ᴀɪ  ${version}\n` +
    `╰──────────────────╯\n\n` +
    `${getGreeting(pushName)}\n\n` +
    `🧠 ᴀɪ  ·  📥 ᴍᴇᴅɪᴀ  ·  🔍 sᴇᴀʀᴄʜ\n` +
    `⚙️ ᴜᴛɪʟs  ·  👤 sᴜᴘᴘᴏʀᴛ\n\n` +
    `\`${p}allmenu\` ꜰᴏʀ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅs`;

  const menuButtons = [
    singleSelect('📋 Quick Start', [
      {
        title: '',
        rows: [
          { header: '🧠 AI Chat',     title: `${p}ai`,      description: 'Chat, image‑gen & more', id: `${p}ai`      },
          { header: '📋 All Commands', title: `${p}allmenu`, description: 'Browse every command',   id: `${p}allmenu` },
          { header: '📥 Downloader',   title: `${p}dl`,      description: 'Save media from links',  id: `${p}dl`      },
        ],
      },
    ]),
  ];

  const heroImage   = getHeroImage();
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
    const lines = [
      `╭──────────────────╮`,
      `  🌸 ʏᴜᴢᴜᴋɪ ᴀɪ  ${version}`,
      `╰──────────────────╯`,
      '',
      getGreeting(pushName),
      '',
      `🧠 ᴀɪ  ·  📥 ᴍᴇᴅɪᴀ  ·  🔍 sᴇᴀʀᴄʜ`,
      `⚙️ ᴜᴛɪʟs  ·  👤 sᴜᴘᴘᴏʀᴛ`,
      '',
      `\`${p}allmenu\` ꜰᴏʀ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅs`,
    ];
    await sock.sendMessage(
      jid,
      { text: lines.join('\n') },
      rawMessage ? { quoted: rawMessage } : {},
    );
  }
}
