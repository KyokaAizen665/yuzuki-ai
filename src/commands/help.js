/**
 * Command: help
 * Lists all commands or shows details for a specific command.
 */
import { findCommand, getByCategory, getCategoryNames } from '../plugins/registry.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'help',
  description: 'List commands or show help for a specific command',
  category:    'utility',
  aliases:     ['h', 'menu', 'cmds'],
  cooldown:    5,
  owner:       false,
  premium:     false,
  group:       null,
};

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function permLabel(meta) {
  const flags = [
    meta.owner   === true  ? 'owner only'    : null,
    meta.premium === true  ? 'premium only'  : null,
    meta.group   === true  ? 'group only'    : null,
    meta.group   === false ? 'private only'  : null,
  ].filter(Boolean);
  return flags.length ? flags.join(', ') : 'everyone';
}

export async function handler(ctx) {
  const { prefix, args } = ctx;
  const query = args[0]?.toLowerCase().trim();

  // ── Detail view for a specific command ──────────────────────────────────
  if (query) {
    const entry = findCommand(query);
    if (!entry) {
      return ctx.reply(`❌ No command found for \`${prefix}${query}\`\n\nTry \`${prefix}help\` for the full list.`);
    }
    const { meta: m } = entry;
    const lines = [
      `*${prefix}${m.name}*`,
      `_${m.description ?? 'No description.'}_`,
      '',
      `📂 Category : ${capitalize(m.category ?? 'general')}`,
      `🔗 Aliases  : ${m.aliases?.length ? m.aliases.map(a => `${prefix}${a}`).join(', ') : 'none'}`,
      `⏱ Cooldown  : ${m.cooldown ?? 0}s`,
      `🔐 Access   : ${permLabel(m)}`,
    ];
    return ctx.reply(lines.join('\n'));
  }

  // ── Full menu view ───────────────────────────────────────────────────────
  const cats = getCategoryNames();
  const lines = [`*${config.botName ?? 'Yuzuki AI'}* — Commands\n`];

  for (const cat of cats) {
    const cmds = getByCategory(cat);
    if (!cmds.length) continue;
    lines.push(`*— ${capitalize(cat)} —*`);
    for (const { meta: m } of cmds) {
      lines.push(`  ${prefix}${m.name} — ${m.description ?? ''}`);
    }
    lines.push('');
  }

  lines.push(`Use \`${prefix}help <command>\` for details.`);
  await ctx.reply(lines.join('\n'));
}
