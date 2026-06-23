/**
 * Command: info
 * Bot runtime info + stats table + owner CTA CALL.
 */
import { config } from '../config/index.js';
import { getStat } from '../database/store.js';
import { formatUptime, formatBytes } from '../utils/helpers.js';
import { getCommandCount } from '../plugins/registry.js';
import {
  sendTable,
  sendInteractive,
  ctaCall,
  quickReply,
} from '../services/rich-messages.js';

export const meta = {
  name:        'info',
  description: 'Bot stats, uptime, and owner contact',
  category:    'utility',
  aliases:     ['stats', 'bot', 'about'],
  cooldown:    5,
  owner:       false,
  premium:     false,
  group:       null,
};

const BRAND_FOOTER = '🌸 Yuzuki AI · Powered by cv3inx';

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage } = ctx;

  const mem     = process.memoryUsage();
  const uptime  = formatUptime(process.uptime() * 1000);
  const rss     = formatBytes(mem.rss);
  const heap    = formatBytes(mem.heapUsed);
  const msgs    = getStat('messages_total') ?? 0;
  const cmds    = getStat('commands_total') ?? 0;
  const plugins = getCommandCount();
  const heapPct = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(0);

  // Render stats as ASCII table
  try {
    await sendTable(sock, jid,
      ['Metric', 'Value'],
      [
        ['🤖 Bot',       `${config.botName ?? 'Yuzuki AI'} v${config.version}`],
        ['⏱ Uptime',     uptime],
        ['🧠 Memory',    `${heap} / ${rss} RSS (${heapPct}%)`],
        ['💬 Messages',  String(msgs)],
        ['⚡ Commands',  String(cmds)],
        ['🔌 Plugins',   String(plugins)],
        ['🛠 Runtime',   `Node.js ${process.version}`],
        ['🔗 Library',   'cv3inx/baileys'],
      ],
      `${config.botName ?? 'Yuzuki AI'} — Live Stats`,
      rawMessage,
    );
  } catch {
    // Plain-text fallback
    await ctx.reply(
      `*${config.botName ?? 'Yuzuki AI'}* v${config.version}\n\n` +
      `⏱ Uptime   : ${uptime}\n` +
      `🧠 Memory   : ${heap} / ${rss} (${heapPct}%)\n` +
      `💬 Messages : ${msgs}\n` +
      `⚡ Commands : ${cmds}\n` +
      `🔌 Plugins  : ${plugins}\n` +
      `Node.js ${process.version} · cv3inx`
    );
  }

  // CTA interactive card with owner contact
  const ownerNum = config.ownerNumber;
  const ctaBtns  = [quickReply('📋 Commands', 'open_menu')];
  if (ownerNum) ctaBtns.unshift(ctaCall('📞 Contact Owner', `+${ownerNum}`));

  await sendInteractive(sock, jid, {
    header:  '🌸 Yuzuki AI',
    body:    `_Premium WhatsApp AI · Powered by cv3inx/baileys_\n\nNeed help? Contact the bot owner or browse the command menu.`,
    footer:  BRAND_FOOTER,
    buttons: ctaBtns,
  }, rawMessage);
}
