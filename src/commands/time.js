/**
 * Command: time
 * World clock — current time + date in any timezone or city.
 * No API key required — uses Intl.DateTimeFormat natively.
 *
 * Usage:
 *   .time                     — bot's local time
 *   .time London              — time in London / Europe/London
 *   .time Asia/Jakarta        — explicit IANA timezone
 *   .time New York            — fuzzy city lookup
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'time',
  description: 'World clock — current time for any city or timezone',
  category:    'tools',
  aliases:     ['clock', 'tz', 'timezone', 'jam'],
  cooldown:    3,
  permission:  'public',
};

const CLOCK_ICON = { url: 'https://img.icons8.com/color/96/wall-clock.png' };

// Common city → IANA timezone shortcuts
const CITY_MAP = {
  'london':'Europe/London','paris':'Europe/Paris','berlin':'Europe/Berlin',
  'rome':'Europe/Rome','madrid':'Europe/Madrid','amsterdam':'Europe/Amsterdam',
  'moscow':'Europe/Moscow','dubai':'Asia/Dubai','riyadh':'Asia/Riyadh',
  'karachi':'Asia/Karachi','mumbai':'Asia/Kolkata','delhi':'Asia/Kolkata',
  'kolkata':'Asia/Kolkata','dhaka':'Asia/Dhaka','colombo':'Asia/Colombo',
  'yangon':'Asia/Rangoon','bangkok':'Asia/Bangkok','jakarta':'Asia/Jakarta',
  'singapore':'Asia/Singapore','kuala lumpur':'Asia/Kuala_Lumpur','kl':'Asia/Kuala_Lumpur',
  'manila':'Asia/Manila','hong kong':'Asia/Hong_Kong','taipei':'Asia/Taipei',
  'seoul':'Asia/Seoul','tokyo':'Asia/Tokyo','sydney':'Australia/Sydney',
  'melbourne':'Australia/Melbourne','auckland':'Pacific/Auckland',
  'los angeles':'America/Los_Angeles','la':'America/Los_Angeles',
  'san francisco':'America/Los_Angeles','sf':'America/Los_Angeles',
  'denver':'America/Denver','chicago':'America/Chicago',
  'new york':'America/New_York','ny':'America/New_York','nyc':'America/New_York',
  'toronto':'America/Toronto','sao paulo':'America/Sao_Paulo',
  'buenos aires':'America/Argentina/Buenos_Aires',
  'accra':'Africa/Accra','lagos':'Africa/Lagos','nairobi':'Africa/Nairobi',
  'cairo':'Africa/Cairo','casablanca':'Africa/Casablanca',
  'ghana':'Africa/Accra','nigeria':'Africa/Lagos','kenya':'Africa/Nairobi',
};

function resolveTimezone(input) {
  if (!input) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = input.toLowerCase().trim();
  if (CITY_MAP[key]) return CITY_MAP[key];

  try {
    Intl.DateTimeFormat('en', { timeZone: input });
    return input;
  } catch {}

  for (const [city, tz] of Object.entries(CITY_MAP)) {
    if (city.includes(key) || key.includes(city)) return tz;
  }

  const capitalised = input.split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('_');
  const guesses = [
    `Europe/${capitalised}`, `America/${capitalised}`, `Asia/${capitalised}`,
    `Africa/${capitalised}`, `Australia/${capitalised}`, `Pacific/${capitalised}`,
  ];
  for (const tz of guesses) {
    try { Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch {}
  }

  return null;
}

function formatTime(tz) {
  const now  = new Date();
  const time = now.toLocaleTimeString('en-GB', { timeZone: tz, hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const date = now.toLocaleDateString('en-GB', { timeZone: tz, weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const offset = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName:'short' })
    .formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? '';
  return { time, date, offset };
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p    = config.prefix;
  const input = args.join(' ').trim();

  if (!input) {
    const clocks = [
      ['🇬🇧 London',    'Europe/London'],
      ['🇦🇪 Dubai',     'Asia/Dubai'],
      ['🇮🇩 Jakarta',   'Asia/Jakarta'],
      ['🇸🇬 Singapore', 'Asia/Singapore'],
      ['🇯🇵 Tokyo',     'Asia/Tokyo'],
      ['🇺🇸 New York',  'America/New_York'],
    ];
    const lines = clocks.map(([label, tz]) => {
      const { time, date } = formatTime(tz);
      return `${label}\n  ⏰ *${time}*  —  _${date}_`;
    }).join('\n\n');

    return sendInteractive(sock, jid, {
      header:       '🌍 World Clock',
      contextImage: CLOCK_ICON,
      body:         lines,
      footer:       `🌸 ${config.botName}`,
      buttons: [
        quickReply('🗼 Tokyo',    'time Tokyo'),
        quickReply('🗽 New York', 'time New York'),
        quickReply('🌆 Jakarta',  'time Jakarta'),
      ],
    }, rawMessage);
  }

  const tz = resolveTimezone(input);
  if (!tz) {
    return ctx.reply(
      `❌ Unknown city or timezone: *"${input}"*\n\n` +
      `Try an IANA timezone like \`Asia/Jakarta\` or a city name like \`London\`.\n` +
      `Use \`${p}time\` for a world clock overview.`
    );
  }

  const { time, date, offset } = formatTime(tz);
  const label = input.split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  return sendInteractive(sock, jid, {
    header:       `🕐 ${label}`,
    contextImage: CLOCK_ICON,
    body:
      `⏰ *${time}* (${offset})\n` +
      `📅 ${date}\n\n` +
      `_Timezone: ${tz}_`,
    footer: `🌸 ${config.botName}`,
    buttons: [
      quickReply('🌍 World Clock', 'time'),
      quickReply('🔄 Refresh',     `time ${input}`),
    ],
  }, rawMessage);
}
