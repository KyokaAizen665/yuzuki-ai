/**
 * Command: lyrics
 * Fetch song lyrics via lyrics.ovh (free, no key needed).
 *
 * Usage:
 *   .lyrics Ed Sheeran Shape of You
 *   .lyrics Eminem Lose Yourself
 *   .lyrics <artist> - <title>
 */
import { sendInteractive, quickReply, ctaUrl } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'lyrics',
  description: 'Get song lyrics — artist + title via lyrics.ovh',
  category:    'scraper',
  aliases:     ['lyric', 'song', 'lirik'],
  cooldown:    6,
  permission:  'public',
};

const LYRICS_ICON = { url: 'https://img.icons8.com/color/96/musical-notes.png' };

function parseArtistTitle(args) {
  const raw = args.join(' ').trim();
  // Support: "artist - title" or "artist title" (last 3 words = title heuristic)
  const dashIdx = raw.indexOf(' - ');
  if (dashIdx !== -1) {
    return { artist: raw.slice(0, dashIdx).trim(), title: raw.slice(dashIdx + 3).trim() };
  }
  // Fallback: first word = artist, rest = title
  const parts  = raw.split(' ');
  const artist = parts.slice(0, Math.max(1, Math.floor(parts.length / 2))).join(' ');
  const title  = parts.slice(Math.max(1, Math.floor(parts.length / 2))).join(' ');
  return { artist, title };
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  if (!args.length) {
    return sendInteractive(sock, jid, {
      header:       '🎵 Lyrics Finder',
      contextImage: LYRICS_ICON,
      body:
        `*Usage:* \`${p}lyrics <artist> - <title>\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}lyrics Ed Sheeran - Shape of You\`\n` +
        `• \`${p}lyrics Eminem Lose Yourself\`\n` +
        `• \`${p}lyrics The Weeknd Blinding Lights\`\n\n` +
        `_Powered by lyrics.ovh_`,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('🎵 Try Example', 'lyrics The Weeknd - Blinding Lights')],
    }, rawMessage);
  }

  const { artist, title } = parseArtistTitle(args);
  if (!artist || !title) {
    return ctx.reply(`❌ Provide both artist and title.\nExample: \`${p}lyrics Ed Sheeran - Shape of You\``);
  }

  try { await ctx.react('🎵'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let lyrics;
  try {
    const url = `https://lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const d   = await r.json();
    if (d.error) throw new Error(d.error);
    lyrics = d.lyrics?.trim();
    if (!lyrics) throw new Error('Empty lyrics returned');
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(
      `❌ Lyrics not found for *"${title}"* by *${artist}*.\n` +
      `Try checking the spelling or use \`artist - title\` format.`
    );
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  // WhatsApp has a 4096-char limit per message
  const MAX     = 3800;
  const preview = lyrics.length > MAX
    ? lyrics.slice(0, MAX) + `\n\n_… (${lyrics.length - MAX} more characters — lyrics truncated)_`
    : lyrics;

  const searchQ = encodeURIComponent(`${artist} ${title} lyrics`);

  return sendInteractive(sock, jid, {
    header:       `🎵 ${title}`,
    contextImage: LYRICS_ICON,
    body:         `🎤 *${artist}*\n\n${preview}`,
    footer:       `🌸 ${config.botName} · lyrics.ovh`,
    buttons: [
      ctaUrl('🔍 Search on Google', `https://www.google.com/search?q=${searchQ}`),
      quickReply('🎵 More Lyrics', 'lyrics'),
    ],
  }, rawMessage);
}
