/**
 * Command: wiki
 * Wikipedia article summaries via the REST API (free, no key).
 * Shows the intro extract + thumbnail image + read-more link.
 *
 * Usage:
 *   .wiki javascript
 *   .wiki Albert Einstein
 *   .wiki random        — random article
 */
import { sendInteractive, quickReply, ctaUrl } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'wiki',
  description: 'Wikipedia article summaries with thumbnail preview',
  category:    'scraper',
  aliases:     ['wikipedia', 'wp'],
  cooldown:    5,
  permission:  'public',
};

const WIKI_ICON = { url: 'https://img.icons8.com/color/96/wikipedia.png' };

async function fetchSummary(term) {
  const encoded = encodeURIComponent(term.replace(/ /g, '_'));
  const url     = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const r       = await fetch(url, {
    headers: { 'User-Agent': 'Yuzuki-AI/2.0 WhatsApp Bot' },
    signal:  AbortSignal.timeout(10_000),
  });
  if (r.status === 404) throw new Error(`No Wikipedia article found for "${term}"`);
  if (!r.ok) throw new Error(`Wikipedia API error: HTTP ${r.status}`);
  return r.json();
}

async function fetchRandom() {
  const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary', {
    headers: { 'User-Agent': 'Yuzuki-AI/2.0 WhatsApp Bot' },
    signal:  AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Wikipedia random error: HTTP ${r.status}`);
  return r.json();
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  if (!sub) {
    return sendInteractive(sock, jid, {
      header:       '📖 Wikipedia',
      contextImage: WIKI_ICON,
      body:
        `*Usage:* \`${p}wiki <topic>\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}wiki Black holes\`\n` +
        `• \`${p}wiki Python programming\`\n` +
        `• \`${p}wiki random\` — surprise me`,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('🎲 Random Article', 'wiki random')],
    }, rawMessage);
  }

  try { await ctx.react('📖'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let article;
  try {
    article = sub === 'random'
      ? await fetchRandom()
      : await fetchSummary(args.join(' '));
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  if (article.type === 'disambiguation') {
    return ctx.reply(
      `📖 *"${article.title}"* is ambiguous.\n\n` +
      `${article.extract?.slice(0, 400) ?? ''}\n\n` +
      `Try being more specific, e.g. \`${p}wiki ${args.join(' ')} programming\``
    );
  }

  const extract = article.extract ?? article.description ?? 'No summary available.';
  const thumb   = article.thumbnail?.source ?? null;
  const pageUrl = article.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title ?? '')}`;

  const body =
    `📖 *${article.title}*\n\n` +
    (article.description ? `_${article.description}_\n\n` : '') +
    extract.slice(0, 600) +
    (extract.length > 600 ? '\n\n_… read more on Wikipedia_' : '');

  return sendInteractive(sock, jid, {
    header:       article.title ?? 'Wikipedia',
    contextImage: thumb ? { url: thumb } : WIKI_ICON,
    body,
    footer:       `🌸 ${config.botName} · Wikipedia`,
    buttons: [
      ctaUrl('📖 Read Full Article', pageUrl),
      quickReply('🎲 Random Article', 'wiki random'),
    ],
  }, rawMessage);
}
