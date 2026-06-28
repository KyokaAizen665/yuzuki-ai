/**
 * Command: remind
 * Set an in-chat reminder. Stored in memory — survives until bot restart.
 *
 * Usage:
 *   .remind 10m Take a break
 *   .remind 1h30m Call mom
 *   .remind 2h Meeting with team
 *   .remind list        — show your pending reminders
 *   .remind cancel <id> — cancel a reminder
 *
 * Time format: 30s | 10m | 2h | 1h30m | 1d
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';
import { log }    from '../utils/logger.js';

export const meta = {
  name:        'remind',
  description: 'Set a timed reminder — I\'ll ping you when time\'s up',
  category:    'tools',
  aliases:     ['reminder', 'remindme', 'alarm', 'ingatkan'],
  cooldown:    3,
  permission:  'public',
};

const REMIND_ICON = { url: 'https://img.icons8.com/color/96/alarm.png' };

const reminders = new Map();
let   nextId    = 1;

const MAX_REMINDERS_PER_USER = 5;
const MAX_DURATION_MS        = 7 * 24 * 60 * 60 * 1000;

function parseDuration(str) {
  const re  = /(\d+)(d|h|m|s)/gi;
  let   ms  = 0;
  let   m;
  const mul = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  while ((m = re.exec(str)) !== null) {
    ms += parseInt(m[1]) * (mul[m[2].toLowerCase()] ?? 0);
  }
  return ms;
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600)  / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec && !d) parts.push(`${sec}s`);
  return parts.join(' ') || '0s';
}

function fmtTime(date) {
  return date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

function fireReminder(sock, id) {
  const r = reminders.get(id);
  if (!r) return;
  reminders.delete(id);

  sock.sendMessage(r.jid, {
    text:
      `⏰ *Reminder!*\n\n` +
      `📝 ${r.message}\n\n` +
      `_Set by you · 🌸 ${config.botName}_`,
    mentions: [r.sender],
  }).catch(e => log.warn(`[remind] Failed to fire reminder ${id}: ${e.message}`));
}

export async function handler(ctx) {
  const { sock, chat: jid, args, sender, rawMessage } = ctx;
  const p = config.prefix;

  const sub = args[0]?.toLowerCase();

  // .remind list
  if (sub === 'list') {
    const mine = [...reminders.values()].filter(r => r.sender === sender);
    if (!mine.length) {
      return sendInteractive(sock, jid, {
        header:       '⏰ Reminders',
        contextImage: REMIND_ICON,
        body:         `📋 You have no pending reminders.\n\nSet one with \`${p}remind 10m text\``,
        footer:       `🌸 ${config.botName}`,
        buttons:      [quickReply('➕ Set Reminder', 'remind')],
      }, rawMessage);
    }
    const now   = Date.now();
    const lines = mine.map(r => {
      const left = Math.max(0, r.fireAt - now);
      return `• [${r.id}] *${r.message}*\n  ⏳ ${fmtDuration(left)} remaining`;
    }).join('\n\n');

    return sendInteractive(sock, jid, {
      header:       '⏰ Your Reminders',
      contextImage: REMIND_ICON,
      body:         lines,
      footer:       `🌸 ${config.botName}`,
      buttons: [
        quickReply('➕ New Reminder',    'remind'),
        quickReply('❌ Cancel #' + mine[0].id, `remind cancel ${mine[0].id}`),
      ],
    }, rawMessage);
  }

  // .remind cancel <id>
  if (sub === 'cancel' || sub === 'del' || sub === 'delete') {
    const id = parseInt(args[1]);
    const r  = reminders.get(id);
    if (!r || r.sender !== sender) {
      return ctx.reply(`❌ Reminder #${id} not found or not yours.`);
    }
    clearTimeout(r.timer);
    reminders.delete(id);
    return sendInteractive(sock, jid, {
      header:       '⏰ Reminder Cancelled',
      contextImage: REMIND_ICON,
      body:         `✅ Reminder #${id} cancelled\n\n_"${r.message}"_`,
      footer:       `🌸 ${config.botName}`,
      buttons:      [quickReply('📋 My Reminders', 'remind list')],
    }, rawMessage);
  }

  // .remind (no args) — show help
  if (!args.length) {
    return sendInteractive(sock, jid, {
      header:       '⏰ Reminder',
      contextImage: REMIND_ICON,
      body:
        `*Usage*\n` +
        `• \`${p}remind 10m Take a break\`\n` +
        `• \`${p}remind 1h30m Call mom\`\n` +
        `• \`${p}remind 2h Meeting\`\n` +
        `• \`${p}remind list\` — your reminders\n` +
        `• \`${p}remind cancel <id>\` — cancel\n\n` +
        `_Time format: 30s · 10m · 2h · 1d_`,
      footer: `🌸 ${config.botName}`,
      buttons: [
        quickReply('⏰ 10 min',   'remind 10m '),
        quickReply('📋 My list',  'remind list'),
      ],
    }, rawMessage);
  }

  // .remind <duration> <message>
  const durationStr = args[0];
  const ms = parseDuration(durationStr);

  if (!ms) {
    return ctx.reply(`❌ Invalid time: \`${durationStr}\`\n\nExamples: \`10m\` \`1h30m\` \`2h\` \`1d\``);
  }
  if (ms > MAX_DURATION_MS) {
    return ctx.reply(`❌ Max reminder time is 7 days.`);
  }

  const message = args.slice(1).join(' ').trim();
  if (!message) {
    return ctx.reply(`❌ Reminder message is empty.\nUsage: \`${p}remind 10m <message>\``);
  }

  const mine = [...reminders.values()].filter(r => r.sender === sender);
  if (mine.length >= MAX_REMINDERS_PER_USER) {
    return ctx.reply(`❌ Max ${MAX_REMINDERS_PER_USER} reminders per user. Cancel one first: \`${p}remind cancel <id>\``);
  }

  const id     = nextId++;
  const fireAt = Date.now() + ms;
  const timer  = setTimeout(() => fireReminder(sock, id), ms);

  reminders.set(id, { id, jid, sender, message, fireAt, timer });

  return sendInteractive(sock, jid, {
    header:       '⏰ Reminder Set!',
    contextImage: REMIND_ICON,
    body:
      `✅ I'll remind you in *${fmtDuration(ms)}*\n\n` +
      `📝 *${message}*\n\n` +
      `🕐 At: _${fmtTime(new Date(fireAt))}_\n` +
      `🆔 ID: \`${id}\``,
    footer: `🌸 ${config.botName}`,
    buttons: [
      quickReply('📋 My Reminders',    'remind list'),
      quickReply(`❌ Cancel #${id}`,   `remind cancel ${id}`),
    ],
  }, rawMessage);
}
