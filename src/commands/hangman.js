/**
 * Command: hangman
 * Classic word-guessing game. Per-chat game state stored in memory.
 *
 * Usage:
 *   .hangman          — start a new game (or show current game)
 *   .hangman <letter> — guess a letter  (e.g.  .hangman e)
 *   .hangman <word>   — guess the whole word
 *   .hangman hint     — reveal one letter (−1 life penalty)
 *   .hangman quit     — end current game and reveal the word
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'hangman',
  description: 'Classic word-guessing hangman game (per-chat)',
  category:    'games',
  aliases:     ['hang', 'guess-word', 'wordgame'],
  cooldown:    2,
  permission:  'public',
};

const HANG_ICON = { url: 'https://img.icons8.com/color/96/puzzle.png' };

const MAX_WRONG = 6;

const WORDS = [
  // Animals
  'elephant','giraffe','penguin','dolphin','cheetah','kangaroo','crocodile','butterfly',
  // Tech
  'javascript','algorithm','database','interface','keyboard','monitor','compiler','network',
  // Food
  'spaghetti','avocado','cinnamon','broccoli','chocolate','watermelon','pineapple','strawberry',
  // General
  'adventure','beautiful','calendar','dangerous','enormous','fantastic','gorgeous','hospital',
  'infinity','jealousy','knowledge','language','mountain','notebook','ordinary','paradise',
  'question','remember','strength','tropical','umbrella','velocity','whisper','xylophone',
  'yourself','zeppelin','abstract','birthday','carnival','diamonds','elevator','festival',
  'grateful','harmony','innocent','junction','keyboard','lantern','mystery','negative',
];

const GALLOWS = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
];

// Per-chat game state
const games = new Map();

function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)].toUpperCase();
}

function displayWord(word, guessed) {
  return word.split('').map(c => (guessed.has(c) ? c : '_')).join(' ');
}

function buildGameBody(game, msg = '') {
  const { word, guessed, wrong } = game;
  const lives     = MAX_WRONG - wrong.size;
  const display   = displayWord(word, guessed);
  const wrongList = wrong.size ? [...wrong].join(' ') : '—';

  return (
    GALLOWS[wrong.size] + '\n\n' +
    (msg ? `${msg}\n\n` : '') +
    `*Word:* \`${display}\`\n` +
    `❤️ Lives: ${lives}/${MAX_WRONG}\n` +
    `❌ Wrong: ${wrongList}\n\n` +
    `_Guess with_ \`.hangman <letter>\`\n` +
    `_or guess the full word_`
  );
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toUpperCase();

  // ── Quit ──────────────────────────────────────────────────────────────────
  if (sub === 'QUIT' || sub === 'END' || sub === 'STOP') {
    const g = games.get(jid);
    if (!g) return ctx.reply('No active hangman game. Start one with `' + p + 'hangman`');
    games.delete(jid);
    return ctx.reply(`💀 Game over! The word was *${g.word}*. Better luck next time!`);
  }

  // ── Show current game ──────────────────────────────────────────────────────
  if (!sub || sub === 'SHOW' || sub === 'STATUS') {
    const g = games.get(jid);
    if (!g) {
      // Start new game
      const newGame = { word: randomWord(), guessed: new Set(), wrong: new Set() };
      games.set(jid, newGame);
      return sendInteractive(sock, jid, {
        header:       '💀 Hangman',
        contextImage: HANG_ICON,
        body:         buildGameBody(newGame, '🎮 *New game started!*'),
        footer:       `🌸 ${config.botName} · ${newGame.word.length} letters`,
        buttons: [
          quickReply('💡 Hint', 'hangman hint'),
          quickReply('🏳️ Quit', 'hangman quit'),
        ],
      }, rawMessage);
    }
    return sendInteractive(sock, jid, {
      header:       '💀 Hangman',
      contextImage: HANG_ICON,
      body:         buildGameBody(g, '🎮 *Game in progress*'),
      footer:       `🌸 ${config.botName} · ${g.word.length} letters`,
      buttons: [
        quickReply('💡 Hint', 'hangman hint'),
        quickReply('🏳️ Quit', 'hangman quit'),
      ],
    }, rawMessage);
  }

  // ── Hint ──────────────────────────────────────────────────────────────────
  if (sub === 'HINT') {
    const g = games.get(jid);
    if (!g) return ctx.reply(`No active game. Start with \`${p}hangman\``);

    // Reveal a random unguessed letter — costs 1 wrong guess
    const unguessed = g.word.split('').filter(c => !g.guessed.has(c));
    if (!unguessed.length) return ctx.reply('All letters already revealed!');

    const hint = unguessed[Math.floor(Math.random() * unguessed.length)];
    g.guessed.add(hint);
    g.wrong.add('💡'); // counts as wrong for life penalty but shows as icon

    const won = g.word.split('').every(c => g.guessed.has(c));
    if (won) {
      games.delete(jid);
      return ctx.reply(`🎉 You (kinda) won! The word was *${g.word}*. Hint revealed *${hint}*!`);
    }
    if (g.wrong.size >= MAX_WRONG) {
      const w = g.word;
      games.delete(jid);
      return ctx.reply(`${GALLOWS[MAX_WRONG]}\n💀 Hanged! The word was *${w}*`);
    }

    return sendInteractive(sock, jid, {
      header:       '💡 Hint Used',
      contextImage: HANG_ICON,
      body:         buildGameBody(g, `💡 Hint: *${hint}* revealed (−1 life)`),
      footer:       `🌸 ${config.botName}`,
      buttons:      [quickReply('🏳️ Quit', 'hangman quit')],
    }, rawMessage);
  }

  // ── Guess ─────────────────────────────────────────────────────────────────
  const g = games.get(jid);
  if (!g) return ctx.reply(`No active game. Start with \`${p}hangman\``);

  const guess = args.join('').toUpperCase().replace(/[^A-Z]/g, '');
  if (!guess) return ctx.reply('❌ Please guess a letter or word.');

  // Full-word guess
  if (guess.length > 1) {
    if (guess === g.word) {
      games.delete(jid);
      await ctx.react('🎉');
      return ctx.reply(`🎉 *You guessed it!* The word was *${g.word}*! Brilliant!`);
    }
    g.wrong.add(`[${guess}]`);
    if (g.wrong.size >= MAX_WRONG) {
      const w = g.word;
      games.delete(jid);
      return ctx.reply(`${GALLOWS[MAX_WRONG]}\n💀 Hanged! The word was *${w}*`);
    }
    return sendInteractive(sock, jid, {
      header:       '❌ Wrong Word',
      contextImage: HANG_ICON,
      body:         buildGameBody(g, `❌ *"${guess}"* is not the word.`),
      footer:       `🌸 ${config.botName}`,
      buttons:      [quickReply('🏳️ Quit', 'hangman quit')],
    }, rawMessage);
  }

  // Single-letter guess
  const letter = guess[0];
  if (g.guessed.has(letter) || g.wrong.has(letter)) {
    return ctx.reply(`⚠️ You already guessed *${letter}*!`);
  }

  if (g.word.includes(letter)) {
    g.guessed.add(letter);
    const won = g.word.split('').every(c => g.guessed.has(c));
    if (won) {
      games.delete(jid);
      await ctx.react('🎉');
      return ctx.reply(`🎉 *You win!* The word was *${g.word}*! 🌸`);
    }
    return sendInteractive(sock, jid, {
      header:       `✅ ${letter} is in the word!`,
      contextImage: HANG_ICON,
      body:         buildGameBody(g, `✅ *${letter}* is correct!`),
      footer:       `🌸 ${config.botName}`,
      buttons: [
        quickReply('💡 Hint', 'hangman hint'),
        quickReply('🏳️ Quit', 'hangman quit'),
      ],
    }, rawMessage);
  }

  // Wrong letter
  g.wrong.add(letter);
  if (g.wrong.size >= MAX_WRONG) {
    const w = g.word;
    games.delete(jid);
    return ctx.reply(`${GALLOWS[MAX_WRONG]}\n💀 *Hanged!* The word was *${w}*.\n\nStart again: \`${p}hangman\``);
  }

  return sendInteractive(sock, jid, {
    header:       `❌ ${letter} is not in the word`,
    contextImage: HANG_ICON,
    body:         buildGameBody(g, `❌ *${letter}* is not in the word.`),
    footer:       `🌸 ${config.botName} · ${MAX_WRONG - g.wrong.size} lives left`,
    buttons: [
      quickReply('💡 Hint', 'hangman hint'),
      quickReply('🏳️ Quit', 'hangman quit'),
    ],
  }, rawMessage);
}
