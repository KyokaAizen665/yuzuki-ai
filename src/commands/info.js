/**
 * Command: info — Phase 9 upgrade
 *
 * PATCH: sendTable() (ASCII box-drawing) replaced by renderTable()
 *        from services/table-renderer.js. Stats now render as a
 *        NativeFlow interactive card — no ASCII art.
 *
 * Bot runtime info + stats table + owner CTA CALL.
 */
import { config }          from '../config/index.js';
import { getStat }         from '../database/store.js';
import { formatUptime, formatBytes } from '../utils/helpers.js';
import { getCommandCount } from '../plugins/registry.js';
import {
  sendInteractive,
  ctaCall,
  quickReply,
}                          from '../services/rich-messages.js';
import { renderTable }     from '../services/table-renderer.js';
import { BRAND_FOOTER }    from '../services/brand.js';

export const meta = {
  name:        'info',
  description: 'Bot stats, uptime, and owner contact',
  category:    'utility',
  aliases:     ['stats', 'bot', 'about'],
  cooldown:    5,
  permission:  'public',
};

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

  await renderTable(ctx, {
    title:   `${config.botName ?? 'Yuzuki AI'} — Live Stats`,
    columns: ['Metric', 'Value'],
    rows: [
      ['🤖 Bot',      `${config.botName ?? 'Yuzuki AI'} v${config.version}`],
      ['⏱ Uptime',    uptime],
      ['🧠 Memory',   `${heap} / ${rss} RSS (${heapPct}%)`],
      ['💬 Messages', String(msgs)],
      ['⚡ Commands', String(cmds)],
      ['🔌 Plugins',  String(plugins)],
      ['🛠 Runtime',  `Node.js ${process.version}`],
      ['🔗 Library',  'cv3inx/baileys'],
    ],
    footer: BRAND_FOOTER,
  });

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
