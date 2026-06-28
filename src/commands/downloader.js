/**
 * Command: downloader
 *
 * Media downloader for YouTube, TikTok, Instagram, Twitter/X, Pinterest,
 * SoundCloud, Spotify previews, and more — powered by the Cobalt API
 * (https://cobalt.tools) with no API key required.
 *
 * Subcommands / aliases:
 *   .dl  <url>           — auto-detect platform, download best quality
 *   .yt  <url>           — YouTube video (mp4)
 *   .yta <url>           — YouTube audio (mp3)
 *   .tt  <url>           — TikTok video (no watermark)
 *   .ig  <url>           — Instagram post / reel
 *   .tw  <url>           — Twitter / X video
 *   .pin <url>           — Pinterest video
 *   .sc  <url>           — SoundCloud audio
 *   .dl help             — show platform list + examples
 *
 * Environment (optional):
 *   COBALT_API_URL  — custom Cobalt instance (default: tries multiple public instances)
 */

import { log } from '../utils/logger.js';
import {
  sendInteractive,
  quickReply,
  ctaUrl,
} from '../services/rich-messages.js';
import { getRandomHeroImage } from '../services/hero-images.js';
import { config }             from '../config/index.js';

export const meta = {
  name:        'dl',
  description: 'Download media from YouTube, TikTok, Instagram, Twitter/X, and more',
  category:    'downloader',
  aliases:     ['yt', 'yta', 'tt', 'ig', 'tw', 'pin', 'sc', 'download'],
  cooldown:    10,
  permission:  'public',
};

// ── Cobalt API instances ───────────────────────────────────────────────────────

// If the user set a custom instance, use it exclusively.
// Otherwise, try each public instance in order until one succeeds.
const CUSTOM_BASE = process.env.COBALT_API_URL?.replace(/\/$/, '') ?? null;

const PUBLIC_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt.privacydev.net',
  'https://cobalt-api.yt-dl.org',
];

/**
 * Platform config: maps command alias → Cobalt request options
 */
const PLATFORM_OPTS = {
  yta: { audioOnly: true,  filenameStyle: 'pretty', videoQuality: 'max' },
  sc:  { audioOnly: true,  filenameStyle: 'pretty', videoQuality: 'max' },
  yt:  { audioOnly: false, filenameStyle: 'pretty', videoQuality: '1080' },
  tt:  { audioOnly: false, filenameStyle: 'pretty', videoQuality: 'max', tiktokH265: true },
  ig:  { audioOnly: false, filenameStyle: 'pretty', videoQuality: 'max' },
  tw:  { audioOnly: false, filenameStyle: 'pretty', videoQuality: 'max' },
  pin: { audioOnly: false, filenameStyle: 'pretty', videoQuality: 'max' },
  dl:  { audioOnly: false, filenameStyle: 'pretty', videoQuality: '1080' },
};

/**
 * cobaltRequest(base, mediaUrl, opts) — single Cobalt instance attempt
 */
async function cobaltRequest(base, mediaUrl, opts = {}) {
  const body = {
    url:           mediaUrl,
    videoQuality:  opts.videoQuality  ?? '1080',
    audioFormat:   opts.audioFormat   ?? 'mp3',
    audioQuality:  opts.audioQuality  ?? '320',
    filenameStyle: opts.filenameStyle ?? 'pretty',
    tiktokH265:    opts.tiktokH265    ?? false,
    youtubeVideoCodec: opts.youtubeVideoCodec ?? 'h264',
  };
  if (opts.audioOnly) body.downloadMode = 'audio';

  const res = await fetch(`${base}/`, {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.status === 'error') {
    throw new Error(data.error?.code ?? 'Cobalt returned an error');
  }

  if (data.status === 'redirect' || data.status === 'stream') {
    return { url: data.url, filename: data.filename ?? 'media', type: data.status };
  }

  if (data.status === 'picker') {
    const first = data.picker?.[0];
    if (!first) throw new Error('No media found in response');
    return { url: first.url, filename: data.filename ?? 'media', type: 'picker', all: data.picker };
  }

  if (data.status === 'rate-limit') {
    throw new Error('rate-limit: too many requests — please wait a moment');
  }

  throw new Error(`Unexpected Cobalt status: ${data.status}`);
}

/**
 * cobaltFetch(mediaUrl, opts) — tries each instance until one succeeds
 */
async function cobaltFetch(mediaUrl, opts = {}) {
  const instances = CUSTOM_BASE ? [CUSTOM_BASE] : PUBLIC_INSTANCES;
  const errors    = [];

  for (const base of instances) {
    try {
      log.debug(`[downloader] Trying Cobalt instance: ${base}`);
      const result = await cobaltRequest(base, mediaUrl, opts);
      log.debug(`[downloader] Success with instance: ${base}`);
      return result;
    } catch (e) {
      log.warn(`[downloader] Instance ${base} failed: ${e.message}`);
      errors.push(`${base}: ${e.message}`);

      // Don't try more instances for certain definitive errors
      const msg = e.message ?? '';
      if (msg.includes('rate-limit') || msg.includes('unavailable') ||
          msg.includes('unsupported') || msg.includes('too_long')) {
        throw e;
      }
    }
  }

  throw new Error(`All Cobalt instances failed:\n${errors.slice(0, 3).join('\n')}`);
}

/**
 * Detect URL → platform shortname for display
 */
function detectPlatform(url) {
  try {
    const h = new URL(url).hostname.replace('www.', '');
    if (/youtube\.com|youtu\.be/.test(h)) return 'YouTube';
    if (/tiktok\.com/.test(h))            return 'TikTok';
    if (/instagram\.com/.test(h))         return 'Instagram';
    if (/twitter\.com|x\.com/.test(h))    return 'Twitter/X';
    if (/pinterest\.com/.test(h))         return 'Pinterest';
    if (/soundcloud\.com/.test(h))        return 'SoundCloud';
    if (/twitch\.tv/.test(h))             return 'Twitch';
    if (/reddit\.com/.test(h))            return 'Reddit';
    if (/vimeo\.com/.test(h))             return 'Vimeo';
    return h;
  } catch {
    return 'Unknown';
  }
}

/**
 * downloadBuffer(cobaltUrl) — stream Cobalt redirect into Buffer
 */
async function downloadBuffer(cobaltUrl) {
  const res = await fetch(cobaltUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Yuzuki-AI/2.0)',
    },
    signal: AbortSignal.timeout(60_000),
    redirect: 'follow',
  });

  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') ?? 'video/mp4';
  const arrayBuf    = await res.arrayBuffer();
  const buffer      = Buffer.from(arrayBuf);

  return { buffer, contentType };
}

// ── Keyword search (all platforms) ───────────────────────────────────────────

/**
 * Platform → DuckDuckGo site-scope pattern.
 * The pattern is matched against candidate URLs extracted from DDG HTML.
 */
const SEARCH_SITES = {
  yt:  { site: 'youtube.com',   pattern: /youtube\.com\/watch\?v=[\w-]+/i },
  yta: { site: 'youtube.com',   pattern: /youtube\.com\/watch\?v=[\w-]+/i },
  tt:  { site: 'tiktok.com',    pattern: /tiktok\.com\/@[^/]+\/video\/\d+/i },
  ig:  { site: 'instagram.com', pattern: /instagram\.com\/(?:p|reel)\/[\w-]+/i },
  tw:  { site: 'x.com',         pattern: /(?:x|twitter)\.com\/\w+\/status\/\d+/i },
  pin: { site: 'pinterest.com', pattern: /pinterest\.com\/pin\/\d+/i },
  sc:  { site: 'soundcloud.com', pattern: /soundcloud\.com\/[\w-]+\/[\w-]+/i },
  dl:  { site: null,             pattern: null },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * searchViaDuckDuckGo(alias, query)
 * Performs a site-scoped DuckDuckGo HTML search and returns the first
 * matching URL for that platform.
 */
async function searchViaDuckDuckGo(alias, query) {
  const cfg = SEARCH_SITES[alias];
  if (!cfg?.site) throw new Error(`No search support for alias: ${alias}`);

  const q       = `site:${cfg.site} ${query}`;
  const encoded = encodeURIComponent(q);
  const ddgUrl  = `https://html.duckduckgo.com/html/?q=${encoded}`;

  const res = await fetch(ddgUrl, {
    headers: {
      'User-Agent':      UA,
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`DuckDuckGo search ${res.status}`);

  const html = await res.text();

  // DDG redirect hrefs contain the real URL in the `uddg` query param
  const uddgMatches = [...html.matchAll(/uddg=([^&"'\s]+)/g)];
  for (const m of uddgMatches) {
    const candidate = decodeURIComponent(m[1]);
    if (!cfg.pattern || cfg.pattern.test(candidate)) {
      return candidate;
    }
  }

  // Fallback: look for bare URLs in result text
  if (cfg.pattern) {
    const bare = html.match(cfg.pattern);
    if (bare) return `https://${bare[0]}`;
  }

  throw new Error(`No ${alias} results found for "${query}"`);
}

/**
 * searchPinterestViaApi(query) — Pinterest's unofficial resource API.
 * Returns a full pinterest.com/pin/{id}/ URL. Best for video pins.
 */
async function searchPinterestViaApi(query) {
  const encoded   = encodeURIComponent(query);
  const dataParam = encodeURIComponent(JSON.stringify({
    options: { query, scope: 'videos', page_size: 5 },
  }));

  const apiUrl =
    `https://www.pinterest.com/resource/BaseSearchResource/get/` +
    `?source_url=${encodeURIComponent(`/search/videos/?q=${encoded}`)}` +
    `&data=${dataParam}` +
    `&_=${Date.now()}`;

  const res = await fetch(apiUrl, {
    headers: {
      'Accept':           'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer':          `https://www.pinterest.com/search/videos/?q=${encoded}`,
      'User-Agent':       UA,
      'Accept-Language':  'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) throw new Error(`Pinterest API ${res.status}`);

  const data    = await res.json();
  const results = data?.resource_response?.data?.results ?? [];
  if (!results.length) throw new Error('No pins in API response');

  const pin = results.find(r => r.videos || r.is_video) ?? results[0];
  if (!pin?.id) throw new Error('Could not extract pin ID');

  return `https://www.pinterest.com/pin/${pin.id}/`;
}

/**
 * searchByKeyword(alias, query)
 * Unified entry point for all platform keyword searches.
 *   pin  → Pinterest API → Pinterest page scrape → DuckDuckGo
 *   rest → DuckDuckGo site-scoped search
 */
async function searchByKeyword(alias, query) {
  // Pinterest: try native API first (better video results)
  if (alias === 'pin') {
    try {
      const url = await searchPinterestViaApi(query);
      log.debug(`[pin] API search → ${url}`);
      return url;
    } catch (e) {
      log.warn(`[pin] API search failed (${e.message}), trying DDG`);
    }
  }

  // DuckDuckGo for all platforms (including pin fallback)
  const url = await searchViaDuckDuckGo(alias, query);
  log.debug(`[${alias}] DDG search → ${url}`);
  return url;
}

// ── Help card ─────────────────────────────────────────────────────────────────

async function sendHelpCard(ctx) {
  const p = config.prefix;
  const { sock, chat: jid, rawMessage } = ctx;

  const body =
    `📥 *Media Downloader*\n` +
    `_All commands accept a URL **or** a search keyword._\n\n` +
    `*Video*\n` +
    `• \`${p}yt  <url or keyword>\`  — YouTube (1080p mp4)\n` +
    `• \`${p}tt  <url or keyword>\`  — TikTok (no watermark)\n` +
    `• \`${p}ig  <url or keyword>\`  — Instagram post / reel\n` +
    `• \`${p}tw  <url or keyword>\`  — Twitter / X video\n` +
    `• \`${p}pin <url or keyword>\`  — Pinterest video\n\n` +
    `*Audio*\n` +
    `• \`${p}yta <url or keyword>\`  — YouTube audio (mp3)\n` +
    `• \`${p}sc  <url or keyword>\`  — SoundCloud track\n\n` +
    `*Auto-detect (URL only)*\n` +
    `• \`${p}dl <url>\`              — Any supported URL\n\n` +
    `_Powered by Cobalt.tools — no login required_`;

  return sendInteractive(sock, jid, {
    header:       '📥 Downloader',
    contextImage: getRandomHeroImage('downloader'),
    body,
    footer:  `🌸 ${config.botName}`,
    buttons: [
      ctaUrl('🌐 Cobalt Site', 'https://cobalt.tools'),
    ],
  }, rawMessage);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { sock, chat: jid, command, args, rawMessage } = ctx;

  // .dl help or bare .dl
  if (args[0]?.toLowerCase() === 'help' || (command === 'dl' && !args[0])) {
    return sendHelpCard(ctx);
  }

  // Map command alias → Cobalt options
  const alias = command.toLowerCase();
  const opts  = PLATFORM_OPTS[alias] ?? PLATFORM_OPTS.dl;

  // ── Keyword search (all supported aliases) ────────────────────────────────
  // If the argument doesn't look like a URL, treat it as a search keyword.
  // .dl requires a URL — it has no single platform to scope the search to.
  const rawArg     = args.join(' ').trim();
  let resolvedUrl  = rawArg;
  const isKeyword  = rawArg && !rawArg.startsWith('http');
  const canSearch  = isKeyword && alias !== 'dl' && SEARCH_SITES[alias]?.site;

  if (isKeyword && alias === 'dl') {
    return ctx.reply(
      `🔗 \`${config.prefix}dl\` requires a full URL.\n` +
      `To search by keyword use a platform command:\n` +
      `_Example:_ \`${config.prefix}yt never gonna give you up\``
    );
  }

  if (canSearch) {
    try { await ctx.react('🔍'); } catch {}
    try { await sock.sendPresenceUpdate('composing', jid); } catch {}

    try {
      resolvedUrl = await searchByKeyword(alias, rawArg);
      log.info(`[${alias}] Resolved "${rawArg}" → ${resolvedUrl}`);
    } catch (err) {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      try { await ctx.react('❌'); } catch {}
      log.warn(`[${alias}] Search failed: ${err.message}`);
      return ctx.reply(
        `❌ Couldn't find a result for *"${rawArg}"* on ${alias.toUpperCase()}.\n` +
        `Try a different keyword, or paste the URL directly.\n` +
        `Use \`${config.prefix}dl help\` to see all supported commands.`
      );
    }
  }

  // No input at all
  if (!resolvedUrl) {
    return ctx.reply(
      `🔗 Provide a URL or search keyword.\n` +
      `_Examples:_\n` +
      `• \`${config.prefix}yt never gonna give you up\`\n` +
      `• \`${config.prefix}yt https://youtu.be/dQw4w9WgXcQ\`\n\n` +
      `Use \`${config.prefix}dl help\` for all supported platforms.`
    );
  }

  // Normalize URL
  let mediaUrl;
  try {
    mediaUrl = new URL(resolvedUrl).toString();
  } catch {
    return ctx.reply('❌ Invalid URL — please provide a full link starting with https://');
  }

  const platform = detectPlatform(mediaUrl);
  log.info(`[downloader] ${platform} | ${alias} | ${mediaUrl.slice(0, 80)}`);

  try { await ctx.react('⏬'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let cobaltResult;
  try {
    cobaltResult = await cobaltFetch(mediaUrl, opts);
  } catch (err) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    try { await ctx.react('❌'); } catch {}

    const msg = err.message ?? '';
    if (msg.includes('rate-limit')) {
      return ctx.reply('⏳ Rate limited — wait a moment then try again.');
    }
    if (msg.includes('content.too_long') || msg.includes('too large') || msg.includes('too_long')) {
      return ctx.reply('❌ This file is too large to send via WhatsApp.');
    }
    if (msg.includes('content.video.unavailable') || msg.includes('unavailable')) {
      return ctx.reply('❌ This video is unavailable or private.');
    }
    if (msg.includes('link.unsupported') || msg.includes('unsupported')) {
      return ctx.reply(
        `❌ This platform or URL is not supported.\n` +
        `Use \`${config.prefix}dl help\` to see supported sites.`
      );
    }
    if (msg.includes('All Cobalt instances failed')) {
      return ctx.reply(
        `❌ Download service is temporarily unavailable.\n` +
        `Please try again in a few minutes.`
      );
    }

    log.error(`[downloader] Cobalt error: ${err.message}`);
    return ctx.reply(`⚠️ Download failed: ${err.message}`);
  }

  // Download the actual media buffer
  let buffer, contentType;
  try {
    ({ buffer, contentType } = await downloadBuffer(cobaltResult.url));
  } catch (err) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    try { await ctx.react('❌'); } catch {}
    log.error(`[downloader] Buffer download failed: ${err.message}`);
    return ctx.reply(`⚠️ Could not fetch the media file: ${err.message}`);
  }

  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  // File size guard — WhatsApp limit ~64MB
  const sizeMB = buffer.length / 1_048_576;
  if (sizeMB > 64) {
    try { await ctx.react('❌'); } catch {}
    return ctx.reply(
      `❌ File is too large (${sizeMB.toFixed(1)} MB).\n` +
      `WhatsApp supports up to ~64 MB. Try a lower quality or shorter clip.`
    );
  }

  // Determine send type
  const isAudio = opts.audioOnly || contentType.startsWith('audio/');
  const caption =
    `📥 *${platform}*\n` +
    `${isAudio ? '🎵' : '🎬'} ${cobaltResult.filename}\n` +
    `_${sizeMB.toFixed(1)} MB · via Cobalt.tools_`;

  try {
    if (isAudio) {
      await sock.sendMessage(
        jid,
        { audio: buffer, mimetype: 'audio/mpeg', ptt: false, fileName: cobaltResult.filename },
        { quoted: rawMessage }
      );
    } else {
      await sock.sendMessage(
        jid,
        { video: buffer, mimetype: 'video/mp4', caption, fileName: cobaltResult.filename },
        { quoted: rawMessage }
      );
    }
    try { await ctx.react('✅'); } catch {}

    if (cobaltResult.type === 'picker' && cobaltResult.all?.length > 1) {
      const remaining = cobaltResult.all.slice(1).length;
      await ctx.reply(
        `ℹ️ This post has *${cobaltResult.all.length}* items.\n` +
        `Sent the first one. The other *${remaining}* can be downloaded using the original link.`
      );
    }
  } catch (err) {
    try { await ctx.react('❌'); } catch {}
    log.error(`[downloader] sendMessage failed: ${err.message}`);
    return ctx.reply(`⚠️ Couldn't send the file: ${err.message}`);
  }
}
