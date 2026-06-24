/**
 * Command: search
 *
 * Web search, image search, and Wikipedia lookup.
 * Powered by public APIs — no API key required.
 *
 * Subcommands:
 *   .search <query>          — DuckDuckGo instant answer + top results
 *   .search image <query>    — image search via Unsplash/DuckDuckGo images
 *   .search wiki <query>     — Wikipedia summary
 *   .search yt <query>       — YouTube video search (title + link)
 *   .search news <query>     — latest news headlines (RSS via inoreader)
 *
 * Aliases: s, find, web, wiki, news
 */

import { log } from '../utils/logger.js';
import {
  sendInteractive,
  sendInteractiveWithImage,
  quickReply,
  ctaUrl,
} from '../services/rich-messages.js';
import { getRandomHeroImage } from '../services/hero-images.js';
import { config }             from '../config/index.js';

export const meta = {
  name:        'search',
  description: 'Web search, Wikipedia lookup, and YouTube search',
  category:    'tools',
  aliases:     ['s', 'find', 'web', 'wiki', 'news'],
  cooldown:    5,
  owner:       false,
  premium:     false,
  group:       null,
};

// ── DuckDuckGo Instant Answer ─────────────────────────────────────────────────

async function ddgInstant(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'Yuzuki-AI/2.0 WhatsApp Bot' },
    signal:  AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);
  return res.json();
}

/**
 * Extract top results from DuckDuckGo RelatedTopics
 */
function extractResults(data, limit = 5) {
  const results = [];

  if (data.Abstract?.trim()) {
    results.push({ title: data.Heading ?? 'Summary', snippet: data.Abstract, url: data.AbstractURL });
  }

  for (const topic of (data.RelatedTopics ?? [])) {
    if (results.length >= limit) break;
    if (topic.Text && topic.FirstURL) {
      results.push({
        title:   topic.Text.split(' - ')[0]?.trim() ?? topic.Text.slice(0, 60),
        snippet: topic.Text,
        url:     topic.FirstURL,
      });
    } else if (topic.Topics) {
      for (const sub of topic.Topics) {
        if (results.length >= limit) break;
        if (sub.Text && sub.FirstURL) {
          results.push({
            title:   sub.Text.split(' - ')[0]?.trim() ?? sub.Text.slice(0, 60),
            snippet: sub.Text,
            url:     sub.FirstURL,
          });
        }
      }
    }
  }

  return results;
}

// ── Wikipedia Summary ─────────────────────────────────────────────────────────

async function wikiSummary(query) {
  const search = encodeURIComponent(query.replace(/ /g, '_'));
  const url    = `https://en.wikipedia.org/api/rest_v1/page/summary/${search}`;
  const res    = await fetch(url, {
    headers: { 'User-Agent': 'Yuzuki-AI/2.0 WhatsApp Bot' },
    signal:  AbortSignal.timeout(10_000),
  });
  if (res.status === 404) {
    // Try search API
    const sRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const sData = await sRes.json();
    const title = sData[1]?.[0];
    if (!title) throw new Error('No Wikipedia article found');
    return wikiSummary(title);
  }
  if (!res.ok) throw new Error(`Wikipedia returned HTTP ${res.status}`);
  const data = await res.json();
  return {
    title:   data.title,
    summary: data.extract?.slice(0, 800) ?? 'No summary available.',
    url:     data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
    thumbnail: data.thumbnail?.source,
  };
}

// ── YouTube Search ────────────────────────────────────────────────────────────

async function ytSearch(query) {
  // Use YouTube's unofficial search RSS endpoint
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Yuzuki-AI/2.0)' },
    signal:  AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`YouTube search failed: HTTP ${res.status}`);

  const html    = await res.text();
  const results = [];

  // Extract video IDs and titles from ytInitialData JSON
  const match = html.match(/var ytInitialData = ({.+?});<\/script>/s);
  if (!match) throw new Error('Could not parse YouTube results');

  const ytData = JSON.parse(match[1]);
  const items  = ytData?.contents
    ?.twoColumnSearchResultsRenderer
    ?.primaryContents
    ?.sectionListRenderer
    ?.contents?.[0]
    ?.itemSectionRenderer
    ?.contents ?? [];

  for (const item of items) {
    if (results.length >= 5) break;
    const vr = item?.videoRenderer;
    if (!vr) continue;
    const title   = vr.title?.runs?.[0]?.text ?? 'Unknown title';
    const videoId = vr.videoId;
    const channel = vr.ownerText?.runs?.[0]?.text ?? 'Unknown';
    const dur     = vr.lengthText?.simpleText ?? '?';
    const views   = vr.viewCountText?.simpleText ?? '?';
    if (videoId) {
      results.push({ title, url: `https://youtu.be/${videoId}`, channel, duration: dur, views });
    }
  }

  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { sock, chat: jid, command, args, rawMessage } = ctx;

  // Determine mode
  const modeOrQuery = args[0]?.toLowerCase();
  const knownModes  = ['image', 'wiki', 'yt', 'youtube', 'news'];
  const mode        = knownModes.includes(modeOrQuery) ? modeOrQuery : 'web';
  const queryArgs   = mode === 'web' ? args : args.slice(1);
  const query       = queryArgs.join(' ').trim();

  // Alias routing: .wiki → wiki mode, .news → news mode
  const aliasMode = { wiki: 'wiki', news: 'news', web: 'web', find: 'web', s: 'web' }[command] ?? mode;
  const finalMode = knownModes.includes(command) ? command : (aliasMode === 'web' && mode !== 'web' ? mode : aliasMode);

  if (!query) {
    const p = config.prefix;
    return sendInteractiveWithImage(sock, jid, {
      header:  '🔍 Search',
      image:   getRandomHeroImage('ai'),
      body:
        `*Web Search — Commands*\n\n` +
        `• \`${p}search <query>\`         — web search\n` +
        `• \`${p}search wiki <query>\`    — Wikipedia\n` +
        `• \`${p}search yt <query>\`      — YouTube\n` +
        `• \`${p}search news <query>\`    — news\n\n` +
        `*Aliases:* \`${p}find\`, \`${p}web\`, \`${p}wiki\`, \`${p}s\``,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        quickReply('🌐 Web search',  'search_web'),
        quickReply('📖 Wikipedia',   'search_wiki'),
        quickReply('▶ YouTube',      'search_yt'),
      ],
    }, rawMessage);
  }

  try { await ctx.react('🔍'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  // ── Wikipedia ──────────────────────────────────────────────────────────────
  if (finalMode === 'wiki') {
    let wiki;
    try {
      wiki = await wikiSummary(query);
    } catch (err) {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      return ctx.reply(`❌ Wikipedia: ${err.message}`);
    }
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    const body =
      `📖 *${wiki.title}*\n\n` +
      `${wiki.summary}${wiki.summary.length >= 800 ? '…' : ''}\n\n` +
      `🔗 _Read more on Wikipedia_`;

    return sendInteractive(sock, jid, {
      header:  `📖 Wikipedia`,
      body,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        ctaUrl('📖 Open Wikipedia', wiki.url),
        quickReply('🔍 More on this', `search ${query}`),
      ],
    }, rawMessage);
  }

  // ── YouTube Search ─────────────────────────────────────────────────────────
  if (finalMode === 'yt' || finalMode === 'youtube') {
    let videos;
    try {
      videos = await ytSearch(query);
    } catch (err) {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      return ctx.reply(`❌ YouTube search failed: ${err.message}`);
    }
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    if (!videos.length) {
      return ctx.reply(`🔍 No YouTube results found for *"${query}"*`);
    }

    const lines = videos
      .map((v, i) => `*${i + 1}.* ${v.title}\n   📺 ${v.channel} · ⏱ ${v.duration} · 👁 ${v.views}\n   ${v.url}`)
      .join('\n\n');

    const body = `▶ *YouTube Results for "${query}"*\n\n${lines}`;

    const firstVideo = videos[0];

    return sendInteractive(sock, jid, {
      header:  '▶ YouTube Search',
      body:    body.slice(0, 1024),
      footer:  `🌸 ${config.botName}`,
      buttons: [
        ctaUrl('▶ Open #1', firstVideo.url),
        ...(videos[1] ? [ctaUrl('▶ Open #2', videos[1].url)] : []),
        quickReply('📥 Download', `yt ${firstVideo.url}`),
      ],
    }, rawMessage);
  }

  // ── News (DuckDuckGo news instant answer) ─────────────────────────────────
  if (finalMode === 'news') {
    let data;
    try {
      data = await ddgInstant(`${query} news`);
    } catch (err) {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      return ctx.reply(`❌ News search failed: ${err.message}`);
    }
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    const results = extractResults(data, 5);

    if (!results.length) {
      return ctx.reply(`🔍 No news found for *"${query}"*\n\nTry a different keyword.`);
    }

    const lines = results
      .map((r, i) => `*${i + 1}.* ${r.title}\n${r.snippet.slice(0, 120)}${r.snippet.length > 120 ? '…' : ''}\n${r.url}`)
      .join('\n\n');

    return sendInteractive(sock, jid, {
      header: '📰 News Search',
      body:   `📰 *News: "${query}"*\n\n${lines}`.slice(0, 1024),
      footer: `🌸 ${config.botName}`,
      buttons: [
        ctaUrl('📰 Read More', results[0].url),
        quickReply('🔄 Refresh', `search news ${query}`),
      ],
    }, rawMessage);
  }

  // ── Web Search (DuckDuckGo) ────────────────────────────────────────────────
  let data;
  try {
    data = await ddgInstant(query);
  } catch (err) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ Search failed: ${err.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const results = extractResults(data, 4);

  if (!results.length && !data.Answer) {
    return sendInteractive(sock, jid, {
      header:  '🔍 No Results',
      body:    `No instant results found for *"${query}"*.\n\nTry being more specific, or open DuckDuckGo directly.`,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        ctaUrl('🌐 Search on DDG', `https://duckduckgo.com/?q=${encodeURIComponent(query)}`),
        quickReply('📖 Try Wikipedia', `search wiki ${query}`),
      ],
    }, rawMessage);
  }

  // Build result text
  const lines = [];

  if (data.Answer) {
    lines.push(`💡 *Answer:* ${data.Answer}\n`);
  }

  if (results.length) {
    lines.push(`🌐 *Results for "${query}"*\n`);
    results.forEach((r, i) => {
      lines.push(`*${i + 1}.* ${r.title}\n${r.snippet?.slice(0, 100) ?? ''}${(r.snippet?.length ?? 0) > 100 ? '…' : ''}`);
    });
  }

  const body = lines.join('\n').slice(0, 1024);

  const topResult = results.find(r => r.url) ?? { url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` };

  return sendInteractive(sock, jid, {
    header:  '🔍 Search Results',
    body,
    footer:  `🌸 ${config.botName}`,
    buttons: [
      ctaUrl('🌐 Open Result', topResult.url),
      ctaUrl('🔍 Search More', `https://duckduckgo.com/?q=${encodeURIComponent(query)}`),
      quickReply('📖 Wikipedia', `search wiki ${query}`),
    ],
  }, rawMessage);
}
