/**
 * Command: ping
 * Tests bot responsiveness — interactive Pong card with latency + quick actions.
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { BRAND_FOOTER }                from '../services/brand.js';

export const meta = {
  name:        'ping',
  description: 'Check bot latency and status',
  category:    'utility',
  aliases:     ['p'],
  cooldown:    3,
  permission:  'public',
};

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, timestamp } = ctx;
  const latencyMs = Math.max(0, Date.now() - timestamp * 1000);
  const memMB     = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  try {
    await sendInteractive(sock, jid, {
      header:  '🏓 Pong!',
      body:
        `ʟᴀᴛᴇɴᴄʏ : ${latencyMs}ms\n` +
        `sᴛᴀᴛᴜs  : Online ✅\n` +
        `ᴍᴇᴍᴏʀʏ  : ${memMB} MB\n` +
        `ᴀɪ      : Ready 🤖`,
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
