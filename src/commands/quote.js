/**
 * Command: quote
 * Inspirational / daily quotes via ZenQuotes.io (free, no key).
 *
 * Usage:
 *   .quote             — random quote
 *   .quote today       — quote of the day
 *   .quote <author>    — quote by author (via quotable.io)
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'quote',
  description: 'Random inspirational quotes and quote of the day',
  category:    'fun',
  aliases:     ['q', 'inspire', 'motivation', 'kutipan'],
  cooldown:    5,
  permission:  'public',
};

async function randomQuote() {
  const r = await fetch('https://zenquotes.io/api/random', { signal: AbortSignal.timeout(8_000) });
  const d = await r.json();
  return { text: d[0].q, author: d[0].a };
}

async function todayQuote() {
  const r = await fetch('https://zenquotes.io/api/today', { signal: AbortSignal.timeout(8_000) });
  const d = await r.json();
  return { text: d[0].q, author: d[0].a };
}

async function authorQuote(author) {
  const url = `https://api.quotable.io/quotes/random?author=${encodeURIComponent(author)}&limit=1`;
  const r   = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const d   = await r.json();
  if (!d?.length) throw new Error(`No quotes found for "${author}"`);
  return { text: d[0].content, author: d[0].author };
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  const sub = args[0]?.toLowerCase();

  try { await ctx.react('✨'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let quote;
  try {
    if (!sub || sub === 'random') {
      quote = await randomQuote();
    } else if (sub === 'today' || sub === 'daily') {
      quote = await todayQuote();
    } else {
      quote = await authorQuote(args.join(' '));
    }
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  return sendInteractive(sock, jid, {
    header: '✨ Quote',
    body:   `_"${quote.text}"_\n\n— *${quote.author}*`,
    footer: `🌸 ${config.botName} · ZenQuotes`,
    buttons: [
      quickReply('🔄 New Quote', 'quote'),
      quickReply('📅 Today\'s', 'quote today'),
    ],
  }, rawMessage);
}
