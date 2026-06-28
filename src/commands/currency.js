/**
 * Command: currency
 * Live exchange rates via Frankfurter API (free, no key, ECB data).
 *
 * Usage:
 *   .currency 100 USD to IDR
 *   .currency 50 EUR GBP
 *   .currency rates USD         — top rates for a base currency
 *   .currency list              — supported currencies
 */
import { sendInteractive, quickReply, ctaCopy } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'currency',
  description: 'Live currency conversion and exchange rates',
  category:    'tools',
  aliases:     ['cur', 'exchange', 'kurs', 'forex'],
  cooldown:    8,
  permission:  'public',
};

const FOREX_ICON  = { url: 'https://img.icons8.com/color/96/currency-exchange.png' };
const BASE_URL    = 'https://api.frankfurter.app';
const POPULAR     = ['USD','EUR','GBP','JPY','IDR','MYR','SGD','AUD','CAD','CHF','CNY','INR','KRW','THB','PHP'];

function fmtAmount(n) {
  if (n >= 1_000_000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1)         return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toPrecision(4);
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  if (!args.length) {
    return sendInteractive(sock, jid, {
      header:       '💱 Currency',
      contextImage: FOREX_ICON,
      body:
        `*Usage*\n` +
        `• \`${p}currency 100 USD IDR\`\n` +
        `• \`${p}currency 50 EUR to GBP\`\n` +
        `• \`${p}currency rates USD\` — top rates\n` +
        `• \`${p}currency list\` — all currencies\n\n` +
        `_Powered by Frankfurter (ECB data)_`,
      footer: `🌸 ${config.botName}`,
      buttons: [
        quickReply('💵 USD→IDR', 'currency 1 USD IDR'),
        quickReply('💶 EUR→USD', 'currency 1 EUR USD'),
      ],
    }, rawMessage);
  }

  const sub = args[0]?.toLowerCase();

  // .currency list
  if (sub === 'list') {
    try {
      const r = await fetch(`${BASE_URL}/currencies`, { signal: AbortSignal.timeout(8_000) });
      const d = await r.json();
      const lines = Object.entries(d).map(([k, v]) => `\`${k}\` ${v}`).join('  ');
      return ctx.reply(`💱 *Supported Currencies*\n\n${lines}`);
    } catch {
      return ctx.reply('❌ Could not fetch currency list.');
    }
  }

  // .currency rates <BASE>
  if (sub === 'rates') {
    const base = (args[1] ?? 'USD').toUpperCase();
    try { await ctx.react('💱'); } catch {}
    try { await sock.sendPresenceUpdate('composing', jid); } catch {}
    let d;
    try {
      const targets = POPULAR.filter(c => c !== base).join(',');
      const r = await fetch(`${BASE_URL}/latest?from=${base}&to=${targets}`, { signal: AbortSignal.timeout(8_000) });
      d = await r.json();
    } catch (e) {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      return ctx.reply(`❌ ${e.message}`);
    }
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    if (!d.rates) return ctx.reply(`❌ Unknown currency: *${base}*`);

    const lines = Object.entries(d.rates)
      .map(([cur, rate]) => `• 1 ${base} = *${fmtAmount(rate)} ${cur}*`)
      .join('\n');

    return sendInteractive(sock, jid, {
      header:       `💱 ${base} Exchange Rates`,
      contextImage: FOREX_ICON,
      body:         `📅 _${d.date}_\n\n${lines}`,
      footer:       `🌸 ${config.botName} · ECB via Frankfurter`,
      buttons: [
        quickReply('🔄 Refresh',   `currency rates ${base}`),
        quickReply('💵 Convert',   'currency'),
      ],
    }, rawMessage);
  }

  // .currency <amount> <FROM> [to] <TO>
  const amount = parseFloat(args[0]);
  if (isNaN(amount)) return ctx.reply(`❌ Invalid amount: \`${args[0]}\`\n\nUsage: \`${p}currency 100 USD IDR\``);

  const fromRaw = args[1]?.toUpperCase();
  const toRaw   = (args[2]?.toLowerCase() === 'to' ? args[3] : args[2])?.toUpperCase();

  if (!fromRaw || !toRaw) {
    return ctx.reply(`❌ Specify both currencies.\nExample: \`${p}currency 100 USD IDR\``);
  }

  try { await ctx.react('💱'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let d;
  try {
    const r = await fetch(`${BASE_URL}/latest?amount=${amount}&from=${fromRaw}&to=${toRaw}`, { signal: AbortSignal.timeout(8_000) });
    d = await r.json();
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  if (d.message || !d.rates) return ctx.reply(`❌ ${d.message ?? `Unknown currency: ${fromRaw} or ${toRaw}`}`);

  const converted  = d.rates[toRaw];
  const rate       = converted / amount;
  const resultText = `${fmtAmount(converted)} ${toRaw}`;

  return sendInteractive(sock, jid, {
    header:       `💱 ${fromRaw} → ${toRaw}`,
    contextImage: FOREX_ICON,
    body:
      `*${fmtAmount(amount)} ${fromRaw}*\n` +
      `= *${resultText}*\n\n` +
      `📊 Rate: 1 ${fromRaw} = ${fmtAmount(rate)} ${toRaw}\n` +
      `📅 _${d.date}_`,
    footer: `🌸 ${config.botName} · ECB via Frankfurter`,
    buttons: [
      ctaCopy('📋 Copy Result', resultText),
      quickReply('🔄 Swap',      `currency ${fmtAmount(converted)} ${toRaw} ${fromRaw}`),
      quickReply('📊 All rates', `currency rates ${fromRaw}`),
    ],
  }, rawMessage);
}
