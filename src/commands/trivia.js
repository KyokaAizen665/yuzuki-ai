/**
 * Command: trivia
 * Interactive multiple-choice trivia via OpenTriviaDB (free, no key).
 * Game state stored per user in memory — answer with the letter A/B/C/D.
 *
 * Usage:
 *   .trivia              — start a new question
 *   .trivia easy         — start easy question
 *   .trivia science      — pick a category
 *   .trivia a / b / c / d — answer the active question
 *   .trivia skip         — skip current question
 *   .trivia score        — your session score
 */
import { sendInteractive, quickReply, sendPoll } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'trivia',
  description: 'Interactive multiple-choice trivia with score tracking',
  category:    'games',
  aliases:     ['quiz', 'tanya'],
  cooldown:    3,
  permission:  'public',
};

const TRIVIA_ICON = { url: 'https://img.icons8.com/color/96/brain--v1.png' };

// Per-user active question: Map<sender, { question, options, correct, score, total }>
const sessions = new Map();

const CATEGORIES = {
  general:     9,  science:     17, computers:   18,
  maths:       19, sports:      21, geography:   22,
  history:     23, politics:    24, art:         25,
  animals:     27, vehicles:    28, anime:       31,
  cartoons:    32, games:       15, film:        11,
  music:       12, books:       10, tv:          14,
};

const DIFFICULTY = ['easy', 'medium', 'hard'];

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchQuestion(category, difficulty) {
  const catId  = CATEGORIES[category?.toLowerCase()] ?? '';
  const diff   = DIFFICULTY.includes(difficulty?.toLowerCase()) ? difficulty.toLowerCase() : '';
  const params = new URLSearchParams({ amount: 1, type: 'multiple', encode: 'url3986' });
  if (catId)  params.set('category',   catId);
  if (diff)   params.set('difficulty', diff);

  const r = await fetch(`https://opentdb.com/api.php?${params}`, { signal: AbortSignal.timeout(10_000) });
  const d = await r.json();
  if (d.response_code !== 0 || !d.results?.length) throw new Error('No trivia question returned');

  const q      = d.results[0];
  const options = shuffle([
    decodeHtml(decodeURIComponent(q.correct_answer)),
    ...q.incorrect_answers.map(a => decodeHtml(decodeURIComponent(a))),
  ]);
  return {
    question:   decodeHtml(decodeURIComponent(q.question)),
    options,
    correct:    decodeHtml(decodeURIComponent(q.correct_answer)),
    category:   decodeHtml(decodeURIComponent(q.category)),
    difficulty: q.difficulty,
  };
}

const LETTERS = ['A', 'B', 'C', 'D'];

export async function handler(ctx) {
  const { sock, chat: jid, args, sender, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  // ── Score ──────────────────────────────────────────────────────────────────
  if (sub === 'score') {
    const s = sessions.get(sender);
    if (!s) return ctx.reply(`📊 No trivia session yet. Start with \`${p}trivia\``);
    const pct = s.total ? Math.round((s.score / s.total) * 100) : 0;
    return sendInteractive(sock, jid, {
      header:       '📊 Trivia Score',
      contextImage: TRIVIA_ICON,
      body:         `✅ Correct: *${s.score}* / ${s.total} (${pct}%)\n\nKeep going!`,
      footer:       `🌸 ${config.botName}`,
      buttons:      [quickReply('🎯 New Question', 'trivia')],
    }, rawMessage);
  }

  // ── Skip ───────────────────────────────────────────────────────────────────
  if (sub === 'skip') {
    const s = sessions.get(sender);
    if (!s?.question) return ctx.reply(`No active question. Start with \`${p}trivia\``);
    const ans = s.options.find(o => o === s.correct);
    sessions.delete(sender);
    return ctx.reply(`⏭ Skipped! The answer was:\n✅ *${ans}*`);
  }

  // ── Answer (a/b/c/d) ───────────────────────────────────────────────────────
  if (sub && LETTERS.includes(sub.toUpperCase())) {
    const s = sessions.get(sender);
    if (!s?.question) {
      return ctx.reply(`No active question. Start one with \`${p}trivia\``);
    }

    const letterIdx = LETTERS.indexOf(sub.toUpperCase());
    const chosen    = s.options[letterIdx];
    if (!chosen) return ctx.reply(`❌ Invalid answer. Use A, B, C, or D.`);

    const isCorrect = chosen === s.correct;
    if (isCorrect) s.score++;
    s.total++;
    s.question = null;

    const body = isCorrect
      ? `✅ *Correct!* Well done!\n\n*${chosen}* was right.\n\n📊 Score: ${s.score}/${s.total}`
      : `❌ *Wrong!* The correct answer was:\n✅ *${s.correct}*\n\n📊 Score: ${s.score}/${s.total}`;

    return sendInteractive(sock, jid, {
      header:       isCorrect ? '🎉 Correct!' : '❌ Wrong!',
      contextImage: TRIVIA_ICON,
      body,
      footer:       `🌸 ${config.botName}`,
      buttons: [
        quickReply('🎯 Next Question', 'trivia'),
        quickReply('📊 My Score',      'trivia score'),
      ],
    }, rawMessage);
  }

  // ── Start new question ─────────────────────────────────────────────────────
  // Parse: .trivia [easy|medium|hard] [category]
  const diffArg = DIFFICULTY.find(d => args.includes(d));
  const catArg  = Object.keys(CATEGORIES).find(c => args.includes(c));

  try { await ctx.react('🎯'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let q;
  try {
    q = await fetchQuestion(catArg, diffArg);
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  // Store session
  const existing = sessions.get(sender) ?? { score: 0, total: 0 };
  sessions.set(sender, { ...existing, question: q.question, options: q.options, correct: q.correct });

  const diffEmoji = { easy: '🟢', medium: '🟡', hard: '🔴' }[q.difficulty] ?? '🔵';
  const opts      = q.options.map((o, i) => `*${LETTERS[i]}*. ${o}`).join('\n');

  const body =
    `${diffEmoji} _${q.category}_ · _${q.difficulty}_\n\n` +
    `*${q.question}*\n\n${opts}\n\n` +
    `_Reply: \`${p}trivia a\` / \`b\` / \`c\` / \`d\`_`;

  return sendInteractive(sock, jid, {
    header:       '🎯 Trivia Time!',
    contextImage: TRIVIA_ICON,
    body,
    footer:       `🌸 ${config.botName} · OpenTriviaDB`,
    buttons: [
      quickReply('A', 'trivia a'),
      quickReply('B', 'trivia b'),
      quickReply('C', 'trivia c'),
      quickReply('D', 'trivia d'),
    ],
  }, rawMessage);
}
