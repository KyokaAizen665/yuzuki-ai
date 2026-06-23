/**
 * Command: reload
 * Hot-reloads all plugins (owner only).
 *
 * Permission enforcement is handled by middleware (meta.owner = true).
 * This handler only contains the reload logic.
 */
import { pluginManager } from '../plugins/loader.js';

export const meta = {
  name:        'reload',
  description: 'Hot-reload all plugins without restarting the bot',
  category:    'owner',
  aliases:     ['rl'],
  cooldown:    10,
  owner:       true,   // middleware enforces this — no inline check needed
  premium:     false,
  group:       null,
};

export async function handler(ctx) {
  await ctx.react('⏳');

  const count  = await pluginManager.reloadAll();
  const status = pluginManager.getStatus();

  const lines = [`✅ *Reload complete* — ${count} plugin(s) loaded`];

  if (status.errors > 0) {
    lines.push(`\n⚠️ *${status.errors} plugin(s) failed:*`);
    for (const err of status.errorList) {
      lines.push(`  • \`${err.file}\`: ${err.message}`);
    }
  }

  await ctx.reply(lines.join('\n'));
}
