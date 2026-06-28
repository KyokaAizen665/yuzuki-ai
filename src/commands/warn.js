/**
 * Command: warn
 * Per-group warn system — admins can issue, view, and clear warns.
 *
 * Usage:
 *   .warn @user [reason]       — issue a warning (auto-kicks at limit)
 *   .unwarn @user              — remove the most recent warning
 *   .clearwarns @user          — wipe all warnings for a user
 *   .warns @user               — show warn history
 *   .warnlimit [n]             — view or set warn limit (default 3, 0 = no auto-kick)
 *
 * Aliases: warn, unwarn, clearwarns, warns, warnlimit
 * Permission: admin
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import {
  getGroup, setGroupSetting,
  addWarn, getWarns, clearWarns,
  getDatabase,
} from '../database/store.js';
import { config } from '../config/index.js';
import { log }   from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';

export const meta = {
  name:        'warn',
  description: 'Group warning system — issue, view, and clear member warnings',
  category:    'group',
  aliases:     ['unwarn', 'clearwarns', 'warns', 'warnlimit'],
  cooldown:    3,
  permission:  'admin',
};

const DEFAULT_WARN_LIMIT = 3;

function getWarnLimit(grp) {
  try {
    const settings = grp?.settings ? JSON.parse(grp.settings) : {};
    const n = parseInt(settings.warnLimit ?? DEFAULT_WARN_LIMIT);
    return Number.isFinite(n) ? n : DEFAULT_WARN_LIMIT;
  } catch { return DEFAULT_WARN_LIMIT; }
}

function setWarnLimit(jid, n) {
  const db  = getDatabase();
  const grp = db.prepare('SELECT settings FROM groups WHERE jid=?').get(jid);
  const settings = grp?.settings ? JSON.parse(grp.settings) : {};
  settings.warnLimit = n;
  setGroupSetting(jid, 'settings', JSON.stringify(settings));
}

function removeLastWarn(jid, groupJid) {
  const db   = getDatabase();
  const last = db.prepare('SELECT id FROM warns WHERE jid=? AND groupJid=? ORDER BY createdAt DESC LIMIT 1').get(jid, groupJid);
  if (!last) return false;
  db.prepare('DELETE FROM warns WHERE id=?').run(last.id);
  return true;
}

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, command, args, fullArgs, sender } = ctx;

  if (!ctx.isGroup) return ctx.reply('❌ This command only works in groups.');

  const grp      = getGroup(normalizeJid(jid));
  const warnLimit = getWarnLimit(grp);

  // ── .warnlimit [n] ────────────────────────────────────────────────────────
  if (command === 'warnlimit') {
    if (!args[0]) {
      return ctx.reply(
        `⚠️ *Warn Limit*\n\nCurrent limit: *${warnLimit}* warn(s)\n` +
        `Set with \`${config.prefix}warnlimit 3\`\n_0 = no auto-kick_`
      );
    }
    const n = parseInt(args[0]);
    if (!Number.isFinite(n) || n < 0 || n > 20) {
      return ctx.reply('❌ Limit must be a number 0–20.');
    }
    setWarnLimit(normalizeJid(jid), n);
    return ctx.reply(n === 0
      ? '✅ Warn limit removed — auto-kick disabled.'
      : `✅ Warn limit set to *${n}*. Members will be kicked when they reach ${n} warn(s).`
    );
  }

  // Resolve target from @mention or quoted reply
  const mentioned = rawMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const targets   = new Set(mentioned.map(normalizeJid));
  if (ctx.quoted?.sender) targets.add(normalizeJid(ctx.quoted.sender));

  if (!targets.size) {
    return sendInteractive(sock, jid, {
      header: '⚠️ Warn System',
      body:
        `*Usage*\n` +
        `\`${config.prefix}warn @user [reason]\`\n` +
        `\`${config.prefix}unwarn @user\`\n` +
        `\`${config.prefix}clearwarns @user\`\n` +
        `\`${config.prefix}warns @user\`\n` +
        `\`${config.prefix}warnlimit [n]\`\n\n` +
        `Current warn limit: *${warnLimit}*`,
      footer: `🌸 ${config.botName}`,
      buttons: [quickReply(`⚙️ Warn Limit`, 'warnlimit')],
    }, rawMessage);
  }

  // ── .warns @user ──────────────────────────────────────────────────────────
  if (command === 'warns') {
    const results = [];
    for (const target of targets) {
      const w = getWarns(target, normalizeJid(jid));
      const name = `@${target.split('@')[0]}`;
      if (!w.length) {
        results.push(`${name} — no warnings ✅`);
      } else {
        const lines = w.map((warn, i) =>
          `  ${i + 1}. ${warn.reason || 'No reason'} _(${warn.createdAt?.slice(0,10) ?? '?'})_`
        ).join('\n');
        results.push(`${name} — *${w.length}/${warnLimit || '∞'}* warn(s)\n${lines}`);
      }
    }
    return sendInteractive(sock, jid, {
      header: '⚠️ Warn History',
      body:   results.join('\n\n'),
      footer: `🌸 ${config.botName}`,
      buttons: [quickReply('📊 Group Info', 'groupinfo')],
    }, rawMessage);
  }

  // ── .unwarn @user ─────────────────────────────────────────────────────────
  if (command === 'unwarn') {
    const results = [];
    for (const target of targets) {
      const removed = removeLastWarn(target, normalizeJid(jid));
      const name = `@${target.split('@')[0]}`;
      const remaining = getWarns(target, normalizeJid(jid)).length;
      results.push(removed
        ? `✅ Removed 1 warning from ${name} — now at *${remaining}/${warnLimit || '∞'}*`
        : `ℹ️ ${name} has no warnings to remove.`
      );
    }
    return ctx.reply(results.join('\n'));
  }

  // ── .clearwarns @user ─────────────────────────────────────────────────────
  if (command === 'clearwarns') {
    const results = [];
    for (const target of targets) {
      const n    = clearWarns(target, normalizeJid(jid));
      const name = `@${target.split('@')[0]}`;
      results.push(n > 0 ? `✅ Cleared *${n}* warning(s) for ${name}.` : `ℹ️ ${name} had no warnings.`);
    }
    return ctx.reply(results.join('\n'));
  }

  // ── .warn @user [reason] ──────────────────────────────────────────────────
  const reason = args.filter(a => !a.startsWith('@')).join(' ').trim() || null;

  for (const target of targets) {
    const name    = `@${target.split('@')[0]}`;
    const count   = addWarn(target, normalizeJid(jid), reason, sender);
    const atLimit = warnLimit > 0 && count >= warnLimit;

    let text =
      `⚠️ *Warning Issued*\n\n` +
      `*User:* ${name}\n` +
      `*Warns:* ${count}/${warnLimit || '∞'}\n` +
      (reason ? `*Reason:* ${reason}\n` : '');

    if (atLimit) {
      text += `\n🚨 _Warn limit reached — removing from group._`;
      try {
        await sock.groupParticipantsUpdate(jid, [target], 'remove');
        await clearWarns(target, normalizeJid(jid));
        log.info(`[warn] Auto-kicked ${target} from ${jid} (${count} warns)`);
      } catch (e) {
        text += `\n❌ Auto-kick failed: ${e.message}`;
        log.warn(`[warn] Auto-kick failed for ${target}: ${e.message}`);
      }
    }

    await sock.sendMessage(jid, { text, mentions: [target] }, { quoted: rawMessage });
  }
}
