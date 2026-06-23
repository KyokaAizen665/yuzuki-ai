/**
 * Command: ping
 * Tests bot responsiveness — interactive Pong card with latency + quick actions.
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';

export const meta = {
  name:        'ping',
  description: 'Check bot latency and status',
  category:    'utility',
  aliases:     ['p'],
  cooldown:    3,
  owner:       false,
  premium:     false,
  group:       null,
};

const BRAND_FOOTER = '🌸 Yuzuki AI · Powered by cv3inx';

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, timestamp } = ctx;
  const latencyMs = Math.max(0, Date.now() - timestamp * 1000);
  const memMB     = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  try {
    await sendInteractive(sock, jid, {
      header:  '🏓 Pong!',
      body:
        `*Latency* : ${latencyMs}ms\n` +
        `*Status*  : Online ✅\n` +
        `*Memory*  : ${memMB} MB\n` +
        `*AI*      : Ready 🤖`,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('🏓 Ping Again', 'ping_again'),
        quickReply('📊 View Stats', 'view_stats'),
      ],
    }, rawMessage);
  } catch {
    await ctx.reply(`🏓 *Pong!*\n⏱ Latency: *${latencyMs}ms*`);
  }
}
