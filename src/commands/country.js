/**
 * Command: country
 * Country info via REST Countries API (free, no key, complete data).
 * Shows flag, population, capital, languages, currency, and more.
 *
 * Usage:
 *   .country Japan
 *   .country US       — also accepts 2-letter ISO codes
 *   .country random   — random country
 */
import { sendInteractive, quickReply, sendList } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'country',
  description: 'Country info — capital, flag, population, currency, languages',
  category:    'scraper',
  aliases:     ['nation', 'flags', 'negara'],
  cooldown:    5,
  permission:  'public',
};

const COUNTRY_ICON = { url: 'https://img.icons8.com/color/96/globe--v1.png' };

function flagEmoji(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

function fmt(n) {
  return n ? n.toLocaleString('en-US') : '?';
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  if (!sub) {
    return sendInteractive(sock, jid, {
      header:       '🌍 Country Info',
      contextImage: COUNTRY_ICON,
      body:
        `*Usage:* \`${p}country <name or ISO code>\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}country Japan\`\n` +
        `• \`${p}country US\`\n` +
        `• \`${p}country random\``,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('🎲 Random Country', 'country random')],
    }, rawMessage);
  }

  try { await ctx.react('🌍'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let data;
  try {
    let url;
    if (sub === 'random') {
      const all = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2', { signal: AbortSignal.timeout(10_000) });
      const list = await all.json();
      const pick = list[Math.floor(Math.random() * list.length)];
      url = `https://restcountries.com/v3.1/alpha/${pick.cca2}`;
    } else if (args[0].length === 2) {
      url = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(args[0])}`;
    } else {
      url = `https://restcountries.com/v3.1/name/${encodeURIComponent(args.join(' '))}?fullText=false`;
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) throw new Error(`Country not found: "${args.join(' ')}"`);
    if (!r.ok) throw new Error(`API error: HTTP ${r.status}`);
    const d = await r.json();
    data = Array.isArray(d) ? d[0] : d;
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const cca2    = data.cca2 ?? '';
  const flag    = flagEmoji(cca2);
  const name    = data.name?.common ?? data.name?.official ?? '?';
  const capital = (data.capital ?? [])[0] ?? '?';
  const pop     = fmt(data.population);
  const region  = `${data.subregion ?? data.region ?? '?'}`;
  const langs   = data.languages
    ? Object.values(data.languages).slice(0, 4).join(', ')
    : '?';
  const currencies = data.currencies
    ? Object.entries(data.currencies)
        .slice(0, 3)
        .map(([code, c]) => `${c.name ?? code} (${c.symbol ?? code})`)
        .join(', ')
    : '?';
  const area     = data.area ? `${fmt(data.area)} km²` : '?';
  const tlds     = (data.tld ?? []).join(', ') || '?';
  const calling  = (data.idd?.root ?? '') + (data.idd?.suffixes?.[0] ?? '');
  const timezones = (data.timezones ?? []).slice(0, 3).join(', ');
  const borders  = (data.borders ?? []).slice(0, 6).map(b => b).join(', ') || 'None';

  const body =
    `${flag} *${name}*  (${cca2})\n\n` +
    `🏙 *Capital:* ${capital}\n` +
    `🌍 *Region:* ${region}\n` +
    `👥 *Population:* ${pop}\n` +
    `📐 *Area:* ${area}\n\n` +
    `🗣 *Languages:* ${langs}\n` +
    `💰 *Currency:* ${currencies}\n` +
    `📞 *Calling Code:* +${calling || '?'}\n` +
    `🌐 *TLD:* ${tlds}\n` +
    `🕐 *Timezones:* ${timezones}\n` +
    `🗺 *Borders:* ${borders}`;

  return sendInteractive(sock, jid, {
    header:       `${flag} ${name}`,
    contextImage: COUNTRY_ICON,
    body,
    footer:       `🌸 ${config.botName} · REST Countries`,
    buttons: [
      quickReply('🎲 Random Country', 'country random'),
      quickReply('🔍 Search Again',   'country'),
    ],
  }, rawMessage);
}
