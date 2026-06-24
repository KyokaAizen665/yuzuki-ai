/**
 * Command: sticker
 *
 * Subcommands:
 *   .brat <text>      — brat-aesthetic sticker (lime green + blurry white text)
 *   .sticker          — convert quoted image/video-frame to WebP sticker
 *   .toimg            — convert quoted sticker back to PNG image
 *
 * Aliases: brat (shorthand for .brat), stick, s2 (for .sticker), s2i (for .toimg)
 */

import sharp      from 'sharp';
import { log }    from '../utils/logger.js';
import { config } from '../config/index.js';
import { downloadMediaMessage } from 'baileys';

export const meta = {
  name:        'sticker',
  description: 'Create stickers: brat style, image→sticker, sticker→image',
  category:    'fun',
  aliases:     ['brat', 'stick', 's2', 'toimg', 's2i'],
  cooldown:    5,
  owner:       false,
  premium:     false,
  group:       null,
};

// ── Brat sticker ──────────────────────────────────────────────────────────────

const BRAT_BG   = '#8ace00';   // lime green — the brat album color
const BRAT_SIZE = 512;

/**
 * Wrap text into lines that fit within maxWidth (rough char-count heuristic).
 * Keeps words together. Max 4 lines; excess text is truncated with …
 */
function wrapBratText(text, maxCharsPerLine = 18, maxLines = 4) {
  const words  = text.split(/\s+/).filter(Boolean);
  const lines  = [];
  let   current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && current !== lines[maxLines - 1]) {
    // truncate last line
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxCharsPerLine - 1) + '…';
  }
  return lines;
}

/**
 * Build the brat SVG.
 * The blur filter gives the smeared ink effect characteristic of brat.
 */
function buildBratSVG(text) {
  const lines       = wrapBratText(text.toLowerCase().trim());
  const lineCount   = lines.length;
  const baseFontSize = lineCount <= 1 ? 96 : lineCount === 2 ? 76 : lineCount === 3 ? 62 : 50;
  const lineHeight  = baseFontSize * 1.18;
  const totalTextH  = lineCount * lineHeight;
  const startY      = (BRAT_SIZE - totalTextH) / 2 + baseFontSize * 0.85;

  const tspans = lines.map((line, i) =>
    `<tspan x="50%" dy="${i === 0 ? 0 : lineHeight}">${escXml(line)}</tspan>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${BRAT_SIZE}" height="${BRAT_SIZE}" viewBox="0 0 ${BRAT_SIZE} ${BRAT_SIZE}">
  <defs>
    <filter id="blur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.4"/>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="${BRAT_SIZE}" height="${BRAT_SIZE}" fill="${BRAT_BG}"/>
  <!-- Blurry white text -->
  <text
    x="50%"
    y="${startY}"
    font-family="Arial Narrow, Arial, Helvetica, sans-serif"
    font-size="${baseFontSize}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    filter="url(#blur)"
    letter-spacing="-2"
  >${tspans}</text>
</svg>`;
}

function escXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function makeBratSticker(text) {
  const svg = buildBratSVG(text);
  return sharp(Buffer.from(svg))
    .resize(BRAT_SIZE, BRAT_SIZE)
    .webp({ quality: 85, lossless: false })
    .toBuffer();
}

// ── Image → Sticker ───────────────────────────────────────────────────────────

async function makeSticker(mediaBuffer, mimetype) {
  let pipeline = sharp(mediaBuffer);

  // If video — take first frame; sharp can't decode video directly.
  // For video frames the caller should provide a jpeg/png already extracted.
  // For animated webp input, preserve animation.
  const isWebp = mimetype?.includes('webp');
  const isGif  = mimetype?.includes('gif');

  if (isWebp || isGif) {
    // Preserve animation for animated stickers
    pipeline = sharp(mediaBuffer, { animated: true });
  }

  const meta = await pipeline.metadata();
  const size = Math.min(Math.max(meta.width ?? 512, meta.height ?? 512), 512);

  return pipeline
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, lossless: isWebp })
    .toBuffer();
}

// ── Sticker → Image ───────────────────────────────────────────────────────────

async function stickerToImage(mediaBuffer) {
  return sharp(mediaBuffer)
    .png()
    .toBuffer();
}

// ── Download quoted media ─────────────────────────────────────────────────────

async function downloadQuoted(sock, ctx) {
  const { quoted } = ctx;
  if (!quoted) return null;

  const SUPPORTED = new Set(['imageMessage', 'stickerMessage', 'videoMessage']);
  if (!SUPPORTED.has(quoted.type)) return null;

  try {
    const buffer = await downloadMediaMessage(
      { message: quoted.message, key: quoted.key },
      'buffer',
      {},
      { logger: log, reuploadRequest: sock.updateMediaMessage }
    );
    return { buffer, mimetype: quoted.media?.mimetype ?? null, type: quoted.type };
  } catch (e) {
    log.error(`[sticker] downloadQuoted failed: ${e.message}`);
    return null;
  }
}

// ── Reply helpers ─────────────────────────────────────────────────────────────

async function sendSticker(sock, jid, buffer, rawMessage) {
  await sock.sendMessage(jid, { sticker: buffer }, { quoted: rawMessage });
}

async function sendImage(sock, jid, buffer, caption, rawMessage) {
  await sock.sendMessage(jid, { image: buffer, caption, mimetype: 'image/png' }, { quoted: rawMessage });
}

// ── Help card ─────────────────────────────────────────────────────────────────

async function sendHelp(ctx) {
  const p = config.prefix;
  return ctx.reply(
    `🎨 *Sticker Commands*\n\n` +
    `• \`${p}brat <text>\`   — brat-style sticker\n` +
    `  _Reply or type:_ \`${p}brat charli xcx\`\n\n` +
    `• \`${p}sticker\`       — image/video → sticker\n` +
    `  _Quote an image then send this_\n\n` +
    `• \`${p}toimg\`         — sticker → image\n` +
    `  _Quote a sticker then send this_`
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, args, command } = ctx;

  // Route aliases:  .brat → brat sub, .sticker / .stick / .s2 → sticker sub,
  //                 .toimg / .s2i → toimg sub
  const isBrat   = command === 'brat';
  const isToImg  = command === 'toimg' || command === 's2i';
  const sub      = isBrat ? 'brat'
                 : isToImg ? 'toimg'
                 : args[0]?.toLowerCase() ?? null;

  // When called as .sticker without sub, treat whole args as potential brat text
  // if there's no quoted media (user just typed .sticker hello → brat)
  const textArg = isBrat
    ? args.join(' ').trim()
    : (sub === 'brat' ? args.slice(1).join(' ').trim() : args.join(' ').trim());

  if (!sub || sub === 'help') return sendHelp(ctx);

  try { await ctx.react('🎨'); } catch {}

  try {
    switch (sub) {
      // ── .brat ──────────────────────────────────────────────────────────────
      case 'brat': {
        if (!textArg) {
          return ctx.reply(`🌿 Send text with the command:\n\`${config.prefix}brat charli xcx\``);
        }
        if (textArg.length > 120) {
          return ctx.reply(`⚠️ Text too long (max 120 chars).`);
        }

        try { await sock.sendPresenceUpdate('composing', jid); } catch {}
        const stickerBuf = await makeBratSticker(textArg);
        await sendSticker(sock, jid, stickerBuf, rawMessage);
        try { await ctx.react('🌿'); } catch {}
        break;
      }

      // ── .sticker / .stick / .s2 ────────────────────────────────────────────
      case 'sticker':
      case 'stick':
      case 's2': {
        const dl = await downloadQuoted(sock, ctx);
        if (!dl) {
          return ctx.reply(
            `📌 *Quote an image or video*, then send \`${config.prefix}sticker\` to convert it to a sticker.`
          );
        }
        if (dl.type === 'stickerMessage') {
          return ctx.reply(`⚠️ That's already a sticker. Use \`${config.prefix}toimg\` to convert it to an image first.`);
        }

        try { await sock.sendPresenceUpdate('composing', jid); } catch {}
        const stickerBuf = await makeSticker(dl.buffer, dl.mimetype);
        await sendSticker(sock, jid, stickerBuf, rawMessage);
        try { await ctx.react('✅'); } catch {}
        break;
      }

      // ── .toimg ─────────────────────────────────────────────────────────────
      case 'toimg':
      case 's2i': {
        const dl = await downloadQuoted(sock, ctx);
        if (!dl) {
          return ctx.reply(
            `📌 *Quote a sticker*, then send \`${config.prefix}toimg\` to convert it to an image.`
          );
        }
        if (dl.type !== 'stickerMessage') {
          return ctx.reply(`⚠️ That's not a sticker. Quote a sticker message.`);
        }

        try { await sock.sendPresenceUpdate('composing', jid); } catch {}
        const imgBuf = await stickerToImage(dl.buffer);
        await sendImage(sock, jid, imgBuf, '🖼️ Sticker converted to image', rawMessage);
        try { await ctx.react('✅'); } catch {}
        break;
      }

      default:
        return sendHelp(ctx);
    }
  } catch (err) {
    log.error(`[sticker] ${sub} failed: ${err.message}`);
    try { await ctx.react('❌'); } catch {}
    return ctx.reply(`⚠️ Sticker error: ${err.message}`);
  }

  try { await sock.sendPresenceUpdate('paused', jid); } catch {}
}
