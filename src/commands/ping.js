/**
 * Command: ping
 * Tests bot responsiveness and message round-trip latency.
 */
export const meta = {
  name:        'ping',
  description: 'Check bot responsiveness and latency',
  category:    'utility',
  aliases:     ['p'],
  cooldown:    3,
  owner:       false,
  premium:     false,
  group:       null,
};

export async function handler(ctx) {
  // ctx.timestamp is a Unix second timestamp from the message
  const msgAgeMs = Math.max(0, Date.now() - ctx.timestamp * 1000);
  await ctx.reply(`🏓 *Pong!*\n⏱ Latency: *${msgAgeMs}ms*`);
}
