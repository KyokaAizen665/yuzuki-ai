/**
 * Command: joke
 * Random jokes + random fun facts via free public APIs.
 *
 * Usage:
 *   .joke              — random joke
 *   .joke dark         — dark humor (owner only)
 *   .joke programming  — dev/programming jokes
 *   .fact              — random fun fact (alias)
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'joke',
  description: 'Random jokes and fun facts',
  category:    'fun',
  aliases:     ['jokes', 'fact', 'facts', 'lucu', 'humor'],
  cooldown:    5,
  permission:  'public',
};

const JOKE_URL = 'https://v2.jokeapi.dev/joke';
const FACT_URL = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';

async function fetchJoke(category = 'Any', blacklist = 'nsfw,racist,sexist') {
  const url = `${JOKE_URL}/${category}?blacklistFlags=${blacklist}&lang=en`;
  const r   = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const d   = await r.json();
  if (d.error) throw new Error(d.message ?? 'No joke found');
  if (d.type === 'single') return { setup: null, punchline: d.joke, category: d.category };
  return { setup: d.setup, punchline: d.delivery, category: d.category };
}

async function fetchFact() {
  const r = await fetch(FACT_URL, { signal: AbortSignal.timeout(8_000) });
  const d = await r.json();
  return d.text;
}

const CAT_MAP = {
  programming: 'Programming', dark: 'Dark', pun: 'Pun',
  spooky: 'Spooky', christmas: 'Christmas', misc: 'Misc',
};

export async function handler(ctx) {
  const { sock, chat: jid, args, command, rawMessage } = ctx;

  const isFact = command === 'fact' || command === 'facts';
  const sub    = args[0]?.toLowerCase();

  // Dark jokes are owner-only
  if (sub === 'dark' && !ctx.isOwner) {
    return ctx.reply(`🔒 Dark jokes are restricted to the bot owner.`);
  }

  try { await ctx.react('😄'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  if (isFact) {
    let fact;
    try {
      fact = await fetchFact();
    } catch (e) {
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
      return ctx.reply(`❌ ${e.message}`);
    }
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    return sendInteractive(sock, jid, {
      header: '🧠 Fun Fact',
      body:   `💡 ${fact}`,
      footer: `🌸 ${config.botName} · UselessFacts`,
      buttons: [
        quickReply('🔄 Another Fact', 'fact'),
        quickReply('😄 Tell a Joke', 'joke'),
      ],
    }, rawMessage);
  }

  const category = CAT_MAP[sub] ?? 'Any';
  const blacklist = sub === 'dark' ? 'nsfw,racist,sexist' : 'nsfw,racist,sexist,explicit';

  let joke;
  try {
    joke = await fetchJoke(category, blacklist);
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const body = joke.setup
    ? `${joke.setup}\n\n||  ${joke.punchline}  ||`
    : joke.punchline;

  return sendInteractive(sock, jid, {
    header: `😄 ${joke.category} Joke`,
    body,
    footer: `🌸 ${config.botName} · JokeAPI`,
    buttons: [
      quickReply('🔄 Another', `joke ${sub ?? ''}`),
      quickReply('💻 Dev Joke', 'joke programming'),
      quickReply('🧠 Fun Fact', 'fact'),
    ],
  }, rawMessage);
}
