/**
 * Command: qr
 * Generate a QR code image from any text or URL.
 * Uses goqr.me API (free, no key).
 *
 * Usage:
 *   .qr https://example.com
 *   .qr Hello World
 *   .qr WIFI:S:MyNetwork;T:WPA;P:mypassword;;
 */
import { config } from '../config/index.js';

export const meta = {
  name:        'qr',
  description: 'Generate a QR code from any text or URL',
  category:    'tools',
  aliases:     ['qrcode', 'qrgen'],
  cooldown:    10,
  permission:  'public',
};

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  const text = args.join(' ').trim();

  if (!text) {
    return ctx.reply(
      `📷 *QR Code Generator*\n\n` +
      `*Usage:* \`${p}qr <text or URL>\`\n\n` +
      `*Examples:*\n` +
      `• \`${p}qr https://github.com\`\n` +
      `• \`${p}qr Hello World\`\n` +
      `• \`${p}qr WIFI:S:MyNet;T:WPA;P:pass;;\``
    );
  }

  try { await ctx.react('⏳'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  // Build goqr.me URL (PNG, 300×300)
  const qrUrl =
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&ecc=M&data=${encodeURIComponent(text)}`;

  let imgBuffer;
  try {
    const r = await fetch(qrUrl, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ab = await r.arrayBuffer();
    imgBuffer = Buffer.from(ab);
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ Failed to generate QR code: ${e.message}`);
  }

  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const caption =
    `📷 *QR Code*\n` +
    `\`${text.length > 60 ? text.slice(0, 60) + '…' : text}\`\n\n` +
    `_Scan with any QR reader_\n🌸 ${config.botName}`;

  try {
    await sock.sendMessage(jid, {
      image:   imgBuffer,
      caption,
      mimetype: 'image/png',
    }, { quoted: rawMessage });
    try { await ctx.react('✅'); } catch {}
  } catch (e) {
    return ctx.reply(`❌ Failed to send QR image: ${e.message}`);
  }
}
