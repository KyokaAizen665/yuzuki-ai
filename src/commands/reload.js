/**
 * Command: reload
 * Hot-reloads all plugins (owner only).
 */
import { pluginManager } from '../plugins/loader.js';
import { config } from '../config/index.js';
import { normalizeJid } from '../utils/jid.js';

export const meta = {
  name:        'reload',
  description: 'Hot-reload all plugins (owner only)',
  category:    'owner',
  aliases:     ['rl'],
  cooldown:    10,
  owner:       true,
  premium:     false,
  group:       null,
};

export async function handler(ctx) {
  // Owner check
  const ownerJid = config.ownerNumber
    ? `${config.ownerNumber}@s.whatsapp.net`
    : null;

  if (ownerJid && normalizeJid(ctx.sender) !== normalizeJid(ownerJid)) {
    return ctx.reply('❌ This command is restricted to the bot owner.');
  }

  await ctx.react('⏳');
  const count = await pluginManager.reloadAll();
  const status = pluginManager.getStatus();

  const lines = [
    `✅ *Reload complete*`,
    `Loaded: ${count} plugin(s)`,
  ];
  if (status.errors > 0) {
    lines.push(`\n⚠️ ${status.errors} failed:`);
    for (const err of status.errorList) {
      lines.push(`  • ${err.file}: ${err.message}`);
    }
  }
  await ctx.reply(lines.join('\n'));
}
