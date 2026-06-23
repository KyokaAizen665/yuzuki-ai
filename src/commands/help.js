/**
 * Command: help
 * Premium NativeFlow menu — category list + command detail view.
 * Uses sendList for the full menu and sendInteractive for command detail.
 */
import { findCommand, getByCategory, getCategoryNames } from '../plugins/registry.js';
import { config } from '../config/index.js';
import {
  sendList,
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

const BRAND_FOOTER = '🌸 Yuzuki AI · Powered by cv3inx';

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

export async function handler(ctx) {
  const { prefix, args, sock, chat: jid, rawMessage } = ctx;
  const query = args[0]?.toLowerCase().trim();

  // ── Detail view for a specific command ──────────────────────────────────────
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
    const aliasText = m.aliases?.length ? m.aliases.map(a => `${prefix}${a}`).join(', ') : 'none';
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

  // ── Full interactive list menu ───────────────────────────────────────────────
  const cats = getCategoryNames();

  const sections = cats.map(cat => {
    const cmds = getByCategory(cat);
    if (!cmds.length) return null;
    return {
      title: `${catIcon(cat)} ${capitalize(cat)}`,
      rows:  cmds.map(({ meta: m }) => ({
        id:          m.name,
        title:       `${prefix}${m.name}`,
        description: (m.description ?? '').slice(0, 72),
      })),
    };
  }).filter(Boolean);

  const totalCmds = sections.reduce((n, s) => n + s.rows.length, 0);

  try {
    await sendList(sock, jid, {
      title:       `${config.botName ?? 'Yuzuki AI'} Commands`,
      description:
        `✨ *${totalCmds} commands* across *${sections.length} categories*\n\n` +
        `Tap any command to see details.\n` +
        `Or use \`${prefix}help <command>\` directly.`,
      buttonText:  '📋 Browse Commands',
      footer:      BRAND_FOOTER,
      sections,
    }, rawMessage);
  } catch {
    // Graceful plain-text fallback
    const lines = [`*${config.botName ?? 'Yuzuki AI'}* — Commands\n`];
    for (const sec of sections) {
      lines.push(`*${sec.title}*`);
      for (const row of sec.rows) lines.push(`  ${row.title} — ${row.description}`);
      lines.push('');
    }
    lines.push(`_Use \`${prefix}help <command>\` for details._\n\n${BRAND_FOOTER}`);
    await ctx.reply(lines.join('\n'));
  }
}
