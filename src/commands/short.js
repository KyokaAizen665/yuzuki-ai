/**
 * Command: short
 * URL shortener using TinyURL (free, no key) with is.gd fallback.
 * Also supports URL expansion (reveal where a short link leads).
 *
 * Usage:
 *   .short https://www.example.com/very/long/path
 *   .short expand https://tinyurl.com/abc123   — preview destination
 *   .short isgd https://example.com            — force is.gd shortener
 */
import { sendInteractive, quickReply, ctaUrl, ctaCopy } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'short',
  description: 'Shorten any URL — TinyURL or is.gd, no account needed',
  category:    'tools',
  aliases:     ['shorten', 'tinyurl', 'urlshort', 'bitly'],
  cooldown:    5,
  permission:  'public',
};

const LINK_ICON = { url: 'https://img.icons8.com/color/96/link--v1.png' };

async function shortenTinyUrl(url) {
  const r = await fetch(
    `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!r.ok) throw new Error(`TinyURL HTTP ${r.status}`);
  const text = (await r.text()).trim();
  if (!text.startsWith('http')) throw new Error(`TinyURL returned invalid: ${text.slice(0, 50)}`);
  return text;
}

async function shortenIsGd(url) {
  const r = await fetch(
    `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!r.ok) throw new Error(`is.gd HTTP ${r.status}`);
  const text = (await r.text()).trim();
  if (!text.startsWith('http')) throw new Error(`is.gd returned invalid: ${text.slice(0, 50)}`);
  return text;
}

async function expandUrl(url) {
  // Follow redirects and return final URL
  const r = await fetch(url, {
    method:   'HEAD',
    redirect: 'follow',
    signal:   AbortSignal.timeout(10_000),
    headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; Yuzuki-AI/2.0)' },
  });
  return r.url ?? url;
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === 'help') {
    return sendInteractive(sock, jid, {
      header:       '🔗 URL Shortener',
      contextImage: LINK_ICON,
      body:
        `*Usage:*\n` +
        `• \`${p}short <url>\` — shorten with TinyURL\n` +
        `• \`${p}short isgd <url>\` — shorten with is.gd\n` +
        `• \`${p}short expand <short-url>\` — see where it leads\n\n` +
        `*Example:*\n` +
        `\`${p}short https://github.com/KyokaAizen665/Yuzuki-ai\``,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('🔗 Try it', 'short https://github.com')],
    }, rawMessage);
  }

  // Expand / preview mode
  if (sub === 'expand' || sub === 'preview' || sub === 'check') {
    const target = args[1];
    if (!target?.startsWith('http')) return ctx.reply('❌ Provide a valid URL to expand.');

    try { await ctx.react('🔍'); } catch {}
    let final;
    try { final = await expandUrl(target); }
    catch (e) { return ctx.reply(`❌ Could not expand URL: ${e.message}`); }

    return sendInteractive(sock, jid, {
      header:       '🔍 URL Expanded',
      contextImage: LINK_ICON,
      body:
        `*Short URL:*\n\`${target}\`\n\n` +
        `*Destination:*\n\`${final}\``,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        ctaUrl('🌐 Visit Destination', final),
        quickReply('🔗 Shorten Another', 'short'),
      ],
    }, rawMessage);
  }

  // Detect provider flag
  const forceIsGd = sub === 'isgd' || sub === 'is.gd' || sub === 'isg';
  const rawUrl    = forceIsGd ? args[1] : args[0];

  if (!rawUrl?.startsWith('http')) {
    return ctx.reply('❌ Provide a full URL starting with `https://`');
  }

  let url;
  try { url = new URL(rawUrl).toString(); }
  catch { return ctx.reply('❌ Invalid URL — must start with `https://`'); }

  try { await ctx.react('🔗'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let short;
  const provider = forceIsGd ? 'is.gd' : 'TinyURL';

  try {
    short = forceIsGd ? await shortenIsGd(url) : await shortenTinyUrl(url);
  } catch (e1) {
    // Try fallback
    try {
      short    = forceIsGd ? await shortenTinyUrl(url) : await shortenIsGd(url);
    } catch (e2) {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      return ctx.reply(`❌ Both shorteners failed:\n• ${e1.message}\n• ${e2.message}`);
    }
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const saved = Math.max(0, url.length - short.length);

  return sendInteractive(sock, jid, {
    header:       '🔗 URL Shortened',
    contextImage: LINK_ICON,
    body:
      `*Original:*\n\`${url.length > 60 ? url.slice(0, 57) + '…' : url}\`\n\n` +
      `*Shortened (${provider}):*\n\`${short}\`\n\n` +
      `📏 Saved ${saved} characters`,
    footer:  `🌸 ${config.botName} · ${provider}`,
    buttons: [
      ctaUrl('🌐 Open Link', short),
      quickReply('🔗 Shorten Another', 'short'),
    ],
  }, rawMessage);
}
