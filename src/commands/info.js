/**
 * Command: info
 * Displays bot runtime information and usage statistics.
 */
import { config } from '../config/index.js';
import { getStat } from '../database/store.js';
import { formatUptime, formatBytes } from '../utils/helpers.js';
import { getCommandCount } from '../plugins/registry.js';

export const meta = {
  name:        'info',
  description: 'Show bot info, uptime, and usage statistics',
  category:    'utility',
  aliases:     ['stats', 'bot', 'about'],
  cooldown:    5,
  owner:       false,
  premium:     false,
  group:       null,
};

export async function handler(ctx) {
  const mem     = process.memoryUsage();
  const uptime  = formatUptime(process.uptime() * 1000);
  const rss     = formatBytes(mem.rss);
  const heap    = formatBytes(mem.heapUsed);
  const msgs    = getStat('messages_total')  ?? 0;
  const cmds    = getStat('commands_total')  ?? 0;
  const plugins = getCommandCount();

  const lines = [
    `*${config.botName ?? 'Yuzuki AI'}* v${config.version}`,
    '',
    `⏱ Uptime   : ${uptime}`,
    `🧠 Memory   : ${rss} RSS / ${heap} heap`,
    `💬 Messages : ${msgs}`,
    `⚡ Commands : ${cmds}`,
    `🔌 Plugins  : ${plugins}`,
    '',
    `Node.js ${process.version}`,
    `Baileys cv3inx fork`,
  ];

  await ctx.reply(lines.join('\n'));
}
