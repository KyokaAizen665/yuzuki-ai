/**
 * Command: meme
 * Random memes via meme-api.com (free, no key, Reddit-sourced).
 * Renders a carousel of 5 fresh memes with quickReply buttons.
 *
 * Usage:
 *   .meme               — 5 random memes (carousel)
 *   .meme programming   — memes from a specific subreddit
 *   .meme dark          — dark humor sub
 */
import { sendCarousel, sendInteractive, quickReply, ctaUrl } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'meme',
  description: 'Random meme carousel from Reddit via meme-api.com',
  category:    'fun',
  aliases:     ['memes', 'dankmeme', 'reddit'],
  cooldown:    8,
  permission:  'public',
};

const MEME_ICON = { url: 'https://img.icons8.com/color/96/comedy.png' };

const SUB_MAP = {
  programming: 'ProgrammerHumor',
  dark:        'darkhumor',
  anime:       'Animemes',
  gaming:      'gaming',
  cats:        'catmemes',
  dogs:        'dogmemes',
  wholesome:   'wholesomememes',
  cringe:      'cringetopia',
  tech:        'techhumor',
};

function detectSub(args) {
  const key = args[0]?.toLowerCase();
  return SUB_MAP[key] ?? null;
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;

  const sub      = detectSub(args);
  const endpoint = sub
    ? `https://meme-api.com/gimme/${sub}/5`
    : 'https://meme-api.com/gimme/5';

  try { await ctx.react('😄'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let memes;
  try {
    const r = await fetch(endpoint, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    memes   = d.memes ?? (d.url ? [d] : null);
    if (!memes?.length) throw new Error('No memes returned');
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ Couldn't fetch memes: ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  // Filter out NSFW + gif (WhatsApp carousel needs static images)
  const clean = memes.filter(m => !m.nsfw && !m.url?.endsWith('.gif')).slice(0, 5);

  if (!clean.length) {
    return ctx.reply('❌ No safe static memes found. Try a different subreddit or run again.');
  }

  const cards = clean.map(m => ({
    imageUrl: m.url,
    body:     m.title?.length > 80 ? m.title.slice(0, 77) + '…' : (m.title ?? '😂'),
    footer:   `r/${m.subreddit}`,
    buttons:  [
      ctaUrl('🔗 View Post', m.postLink ?? m.url),
      quickReply('🔄 More Memes', 'meme'),
    ],
  }));

  const label = sub ? `r/${sub}` : 'Random';

  try {
    await sendCarousel(sock, jid, {
      body:  `😂 *${label} Memes*  |  🌸 ${config.botName}`,
      cards,
    }, rawMessage);
    try { await ctx.react('😂'); } catch {}
  } catch {
    // Carousel fallback already handled inside sendCarousel
  }
}
