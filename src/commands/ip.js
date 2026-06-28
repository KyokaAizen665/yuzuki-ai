/**
 * Command: ip
 * IP address geolocation and info via ip-api.com (free, no key, 45 req/min).
 * Also detects the caller's own IP if none is provided.
 *
 * Usage:
 *   .ip                    — info about your own IP (from request)
 *   .ip 8.8.8.8            — info about a specific IP
 *   .ip google.com         — resolve hostname then look up IP
 */
import { sendInteractive, quickReply, sendList } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'ip',
  description: 'IP address & geolocation lookup — free, no key required',
  category:    'tools',
  aliases:     ['ipinfo', 'geoip', 'whois-ip', 'myip'],
  cooldown:    5,
  permission:  'public',
};

const IP_ICON = { url: 'https://img.icons8.com/color/96/ip-address.png' };

async function lookupIP(target) {
  const encoded = encodeURIComponent(target);
  const r = await fetch(
    `http://ip-api.com/json/${encoded}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!r.ok) throw new Error(`ip-api.com HTTP ${r.status}`);
  const d = await r.json();
  if (d.status === 'fail') throw new Error(d.message ?? 'Lookup failed');
  return d;
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p      = config.prefix;
  const target = args[0]?.trim();

  if (!target) {
    return sendInteractive(sock, jid, {
      header:       '🌐 IP Lookup',
      contextImage: IP_ICON,
      body:
        `*Usage:* \`${p}ip <address or hostname>\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}ip 8.8.8.8\`\n` +
        `• \`${p}ip 1.1.1.1\`\n` +
        `• \`${p}ip google.com\`\n\n` +
        `_Powered by ip-api.com_`,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('🔍 Try: 8.8.8.8', 'ip 8.8.8.8')],
    }, rawMessage);
  }

  try { await ctx.react('🌐'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let info;
  try {
    info = await lookupIP(target);
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const flagEmoji = info.countryCode
    ? String.fromCodePoint(...[...info.countryCode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))
    : '🌐';

  const body =
    `🌐 *IP:* \`${info.query}\`\n\n` +
    `${flagEmoji} *Country:* ${info.country ?? '?'} (${info.countryCode ?? '?'})\n` +
    `🏙 *City:* ${info.city ?? '?'}, ${info.regionName ?? '?'}\n` +
    `📮 *ZIP:* ${info.zip ?? '?'}\n` +
    `🕐 *Timezone:* ${info.timezone ?? '?'}\n\n` +
    `📡 *ISP:* ${info.isp ?? '?'}\n` +
    `🏢 *Org:* ${info.org ?? '?'}\n\n` +
    `${info.proxy  ? '⚠️ *Proxy/VPN detected*\n' : ''}` +
    `${info.hosting ? '🖥 *Hosting/Datacenter IP*\n' : ''}` +
    `${info.mobile  ? '📱 *Mobile network*\n' : ''}` +
    `📍 *Coordinates:* ${info.lat}, ${info.lon}`;

  return sendInteractive(sock, jid, {
    header:       `🌐 ${info.query}`,
    contextImage: IP_ICON,
    body:         body.trim(),
    footer:       `🌸 ${config.botName} · ip-api.com`,
    buttons: [
      quickReply('🗺 Map It', `ip ${info.query}`),
      quickReply('🔍 New Lookup', 'ip'),
    ],
  }, rawMessage);
}
