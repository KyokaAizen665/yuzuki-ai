/**
 * Command: rps
 * Rock Paper Scissors against the bot.
 * Tracks wins/losses/draws per-user for the session.
 *
 * Usage:
 *   .rps rock / paper / scissors
 *   .rps r / p / s       — shorthand
 *   .rps score           — your win/loss/draw record
 *   .rps reset           — reset your score
 */
import { sendInteractive, quickReply, sendPoll } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'rps',
  description: 'Rock Paper Scissors against the bot — tracks your score',
  category:    'games',
  aliases:     ['rockpaperscissors', 'rsp', 'spr'],
  cooldown:    2,
  permission:  'public',
};

const RPS_ICON = { url: 'https://img.icons8.com/color/96/rock-on.png' };

const CHOICES = {
  rock: '🪨', paper: '📄', scissors: '✂️',
  r:    '🪨', p:     '📄', s:        '✂️',
};
const NORMALISE = { rock: 'rock', paper: 'paper', scissors: 'scissors', r: 'rock', p: 'paper', s: 'scissors' };
const BOT_CHOICES = ['rock', 'paper', 'scissors'];

function beats(a, b) {
  return (a === 'rock'     && b === 'scissors') ||
         (a === 'paper'    && b === 'rock')     ||
         (a === 'scissors' && b === 'paper');
}

// Per-user score: Map<sender, {wins,losses,draws}>
const scores = new Map();

export async function handler(ctx) {
  const { sock, chat: jid, args, sender, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === 'help') {
    return sendInteractive(sock, jid, {
      header:       '🪨📄✂️ Rock Paper Scissors',
      contextImage: RPS_ICON,
      body:
        `Challenge the bot!\n\n` +
        `*Usage:* \`${p}rps <rock|paper|scissors>\`\n` +
        `*Shorthand:* \`${p}rps r/p/s\`\n\n` +
        `*Other:*\n` +
        `• \`${p}rps score\` — your record\n` +
        `• \`${p}rps reset\` — reset score`,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        quickReply('🪨 Rock',     'rps rock'),
        quickReply('📄 Paper',    'rps paper'),
        quickReply('✂️ Scissors', 'rps scissors'),
      ],
    }, rawMessage);
  }

  if (sub === 'score' || sub === 'stats') {
    const s    = scores.get(sender) ?? { wins: 0, losses: 0, draws: 0 };
    const total = s.wins + s.losses + s.draws;
    const wr   = total ? Math.round((s.wins / total) * 100) : 0;
    return sendInteractive(sock, jid, {
      header:       '📊 Your RPS Stats',
      contextImage: RPS_ICON,
      body:
        `🏆 *Wins:* ${s.wins}\n` +
        `💀 *Losses:* ${s.losses}\n` +
        `🤝 *Draws:* ${s.draws}\n` +
        `📈 *Win Rate:* ${wr}%  (${total} games)`,
      footer:  `🌸 ${config.botName}`,
      buttons: [
        quickReply('🪨 Play Again', 'rps rock'),
        quickReply('🗑 Reset Score', 'rps reset'),
      ],
    }, rawMessage);
  }

  if (sub === 'reset') {
    scores.delete(sender);
    return ctx.reply('✅ Score reset! Fresh start 🌸');
  }

  const player = NORMALISE[sub];
  if (!player) {
    return ctx.reply(
      `❌ Invalid choice: *"${sub}"*\n` +
      `Use: \`${p}rps rock\`, \`${p}rps paper\`, or \`${p}rps scissors\``
    );
  }

  const bot    = BOT_CHOICES[Math.floor(Math.random() * 3)];
  const result = player === bot ? 'draw' : beats(player, bot) ? 'win' : 'loss';

  const s = scores.get(sender) ?? { wins: 0, losses: 0, draws: 0 };
  if (result === 'win')  s.wins++;
  if (result === 'loss') s.losses++;
  if (result === 'draw') s.draws++;
  scores.set(sender, s);

  const resultText = {
    win:  '🎉 *You win!*',
    loss: '😞 *You lose!*',
    draw: '🤝 *It\'s a draw!*',
  }[result];

  const emoji  = { win: '🎉', loss: '😞', draw: '🤝' }[result];
  try { await ctx.react(emoji); } catch {}

  return sendInteractive(sock, jid, {
    header:       `🪨📄✂️ ${resultText}`,
    contextImage: RPS_ICON,
    body:
      `You: ${CHOICES[player]} *${player}*\n` +
      `Bot: ${CHOICES[bot]} *${bot}*\n\n` +
      `${resultText}\n\n` +
      `📊 Record: ${s.wins}W / ${s.losses}L / ${s.draws}D`,
    footer:  `🌸 ${config.botName}`,
    buttons: [
      quickReply('🔄 Play Again', `rps ${player}`),
      quickReply('📊 My Score',   'rps score'),
    ],
  }, rawMessage);
}
