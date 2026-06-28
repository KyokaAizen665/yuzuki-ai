/**
 * Command: anime
 * Anime search and info via Jikan v4 (unofficial MyAnimeList API, free, no key).
 * Results displayed as a carousel with images, ratings, and synopsis.
 *
 * Usage:
 *   .anime attack on titan   — search anime
 *   .anime top               — top anime of all time
 *   .anime trending          — currently airing
 *   .anime random            — random anime
 */
import { sendCarousel, sendInteractive, quickReply, ctaUrl } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'anime',
  description: 'Search anime info and get top/trending via MyAnimeList',
  category:    'scraper',
  aliases:     ['ani', 'myanimelist', 'mal'],
  cooldown:    8,
  permission:  'public',
};

const ANIME_ICON = { url: 'https://img.icons8.com/color/96/anime.png' };
const BASE       = 'https://api.jikan.moe/v4';

function truncate(str, n = 120) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

async function jikanGet(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Accept': 'application/json' },
    signal:  AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`Jikan ${r.status}`);
  return r.json();
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  try { await ctx.react('🎌'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let items;

  try {
    if (!sub || sub === 'help') {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      return sendInteractive(sock, jid, {
        header:       '🎌 Anime Search',
        contextImage: ANIME_ICON,
        body:
          `*Usage*\n` +
          `• \`${p}anime <title>\` — search\n` +
          `• \`${p}anime top\` — all-time top 10\n` +
          `• \`${p}anime trending\` — currently airing\n` +
          `• \`${p}anime random\` — surprise me\n\n` +
          `_Powered by Jikan / MyAnimeList_`,
        footer:  `🌸 ${config.botName}`,
        buttons: [quickReply('🏆 Top Anime', 'anime top')],
      }, rawMessage);
    }

    if (sub === 'top' || sub === 'best') {
      const d = await jikanGet('/top/anime?limit=10&filter=bypopularity');
      items   = d.data ?? [];
    } else if (sub === 'trending' || sub === 'airing') {
      const d = await jikanGet('/top/anime?limit=10&filter=airing');
      items   = d.data ?? [];
    } else if (sub === 'random') {
      const d = await jikanGet('/random/anime');
      items   = [d.data];
    } else {
      const query = args.join(' ');
      const d     = await jikanGet(`/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`);
      items       = d.data ?? [];
    }
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  if (!items?.length) return ctx.reply('❌ No results found.');

  const cards = items.slice(0, 5).map(a => {
    const score    = a.score ? `⭐ ${a.score}` : '⭐ N/A';
    const episodes = a.episodes ? `📺 ${a.episodes} eps` : '📺 ?';
    const status   = a.status ?? '';
    const genres   = (a.genres ?? []).slice(0, 2).map(g => g.name).join(', ');

    return {
      imageUrl: a.images?.jpg?.image_url ?? '',
      body:
        `*${a.title}*\n` +
        `${score}  ${episodes}\n` +
        `${genres ? `🏷 ${genres}\n` : ''}` +
        truncate(a.synopsis),
      footer:  status,
      buttons: [
        ctaUrl('🔗 View on MAL', a.url ?? 'https://myanimelist.net'),
        quickReply('🎌 Search Again', 'anime'),
      ],
    };
  });

  const label = sub === 'top' ? 'Top Anime' : sub === 'trending' ? 'Currently Airing' :
                sub === 'random' ? 'Random Pick' : `"${args.join(' ')}"`;

  await sendCarousel(sock, jid, {
    body:  `🎌 *${label}*  |  🌸 ${config.botName}`,
    cards,
  }, rawMessage);
}
