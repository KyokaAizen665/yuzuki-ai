/**
 * Command: weather
 * Current conditions + 3-day forecast via Open-Meteo (free, no key).
 * Geocoding via nominatim.openstreetmap.org.
 *
 * Usage:
 *   .weather <city>           — current conditions
 *   .weather <city> forecast  — 3-day forecast
 */
import { sendInteractive, quickReply, ctaUrl } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'weather',
  description: 'Current weather and 3-day forecast for any city',
  category:    'tools',
  aliases:     ['w', 'cuaca', 'forecast'],
  cooldown:    10,
  permission:  'public',
};

const UA = 'Yuzuki-AI/2.0 WhatsApp Bot';

const WMO = {
  0:'☀️ Clear',1:'🌤 Mostly clear',2:'⛅ Partly cloudy',3:'☁️ Overcast',
  45:'🌫 Foggy',48:'🌫 Icy fog',
  51:'🌦 Light drizzle',53:'🌦 Drizzle',55:'🌦 Heavy drizzle',
  61:'🌧 Light rain',63:'🌧 Rain',65:'🌧 Heavy rain',
  71:'🌨 Light snow',73:'🌨 Snow',75:'🌨 Heavy snow',77:'🌨 Snowfall',
  80:'🌦 Showers',81:'🌦 Heavy showers',82:'⛈ Violent showers',
  85:'🌨 Snow showers',86:'🌨 Heavy snow showers',
  95:'⛈ Thunderstorm',96:'⛈ Thunderstorm w/ hail',99:'⛈ Heavy thunderstorm',
};

// WMO code → OpenWeatherMap icon name (free public CDN, no key needed)
function wmoIcon(code) {
  if (code === 0 || code === 1)                     return '01d'; // clear
  if (code === 2)                                   return '02d'; // partly cloudy
  if (code === 3)                                   return '04d'; // overcast
  if (code === 45 || code === 48)                   return '50d'; // fog
  if (code >= 51 && code <= 55)                     return '09d'; // drizzle
  if (code >= 61 && code <= 65)                     return '10d'; // rain
  if (code >= 71 && code <= 77)                     return '13d'; // snow
  if (code >= 80 && code <= 82)                     return '09d'; // showers
  if (code >= 85 && code <= 86)                     return '13d'; // snow showers
  if (code >= 95)                                   return '11d'; // thunderstorm
  return '02d';
}

function weatherIcon(code) {
  return { url: `https://openweathermap.org/img/wn/${wmoIcon(code)}@2x.png` };
}

function wmoLabel(code) { return WMO[code] ?? `Code ${code}`; }

async function geocode(city) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
  const r   = await fetch(url, { headers:{ 'User-Agent': UA }, signal: AbortSignal.timeout(8_000) });
  const d   = await r.json();
  if (!d?.length) throw new Error(`City not found: "${city}"`);
  return { name: d[0].display_name.split(',').slice(0,2).join(',').trim(), lat: d[0].lat, lon: d[0].lon };
}

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weathercode` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&timezone=auto&forecast_days=4`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`Weather API error: HTTP ${r.status}`);
  return r.json();
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  const forecastFlag = args.at(-1)?.toLowerCase() === 'forecast';
  const cityArgs     = forecastFlag ? args.slice(0, -1) : args;
  const city         = cityArgs.join(' ').trim();

  if (!city) {
    return sendInteractive(sock, jid, {
      header:       '🌤 Weather',
      contextImage: { url: 'https://openweathermap.org/img/wn/02d@2x.png' },
      body:
        `*Usage*\n` +
        `• \`${p}weather <city>\` — current weather\n` +
        `• \`${p}weather <city> forecast\` — 3-day forecast\n\n` +
        `_Example:_ \`${p}weather London\``,
      footer: `🌸 ${config.botName}`,
      buttons: [quickReply('🌍 Try: London', 'weather London')],
    }, rawMessage);
  }

  try { await ctx.react('🔍'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let geo, data;
  try {
    geo  = await geocode(city);
    data = await fetchWeather(geo.lat, geo.lon);
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const c        = data.current;
  const icon     = weatherIcon(c.weathercode);
  const mapsUrl  = `https://www.google.com/maps/search/${encodeURIComponent(geo.name)}`;

  if (forecastFlag) {
    const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const lines  = data.daily.time.slice(1, 4).map((date, i) => {
      const d   = new Date(date);
      const day = days[d.getDay()];
      const hi  = data.daily.temperature_2m_max[i + 1];
      const lo  = data.daily.temperature_2m_min[i + 1];
      const cond= wmoLabel(data.daily.weathercode[i + 1]);
      const rain= data.daily.precipitation_sum[i + 1];
      return `*${day}* — ${cond}\n  🌡 ${hi}°C / ${lo}°C  💧 ${rain}mm`;
    }).join('\n\n');

    return sendInteractive(sock, jid, {
      header:       '📅 3-Day Forecast',
      contextImage: weatherIcon(data.daily.weathercode[1]),
      body:         `📍 *${geo.name}*\n\n${lines}`,
      footer:       `🌸 ${config.botName} · Open-Meteo`,
      buttons: [
        quickReply('🌤 Current', `weather ${city}`),
        ctaUrl('🗺 Open Map', mapsUrl),
      ],
    }, rawMessage);
  }

  const body =
    `📍 *${geo.name}*\n\n` +
    `${wmoLabel(c.weathercode)}\n` +
    `🌡 *${c.temperature_2m}°C* (feels ${c.apparent_temperature}°C)\n` +
    `💧 Humidity: ${c.relative_humidity_2m}%\n` +
    `💨 Wind: ${c.wind_speed_10m} km/h`;

  return sendInteractive(sock, jid, {
    header:       '🌤 Weather',
    contextImage: icon,
    body,
    footer:       `🌸 ${config.botName} · Open-Meteo`,
    buttons: [
      quickReply('📅 3-Day Forecast', `weather ${city} forecast`),
      ctaUrl('🗺 Open Map', mapsUrl),
    ],
  }, rawMessage);
}
