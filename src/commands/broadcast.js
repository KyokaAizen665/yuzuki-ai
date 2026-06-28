/**
 * Command: broadcast
 * Owner-only: send a message to all known users or groups.
 *
 * Usage:
 *   .broadcast <message>         — send to all users in DB
 *   .broadcast groups <message>  — send to all known groups
 *   .broadcast all <message>     — send to users AND groups
 *
 * Aliases: bcast, announce
 * Permission: owner
 */
import { getDatabase } from '../database/index.js';
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';
import { log }   from '../utils/logger.js';

export const meta = {
  name:        'broadcast',
  description: 'Send a message to all users or groups (owner only)',
  category:    'owner',
  aliases:     ['bcast', 'announce'],
  cooldown:    30,
  permission:  'owner',
};

async function trySend(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
    return true;
  } catch (e) {
    log.warn(`[broadcast] Failed to send to ${jid}: ${e.message}`);
    return false;
  }
}

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, args, fullArgs } = ctx;

  const db = getDatabase();

  // Parse subcommand
  let target = 'users';
  let message;

  if (['groups','group'].includes(args[0]?.toLowerCase())) {
    target  = 'groups';
    message = args.slice(1).join(' ').trim();
  } else if (['all','everyone'].includes(args[0]?.toLowerCase())) {
    target  = 'all';
    message = args.slice(1).join(' ').trim();
  } else {
    message = fullArgs.trim();
  }

  if (!message) {
    return sendInteractive(sock, jid, {
      header: '📢 Broadcast',
      body:
        `*Usage*\n` +
        `\`${config.prefix}broadcast <message>\` — all users\n` +
        `\`${config.prefix}broadcast groups <message>\` — all groups\n` +
        `\`${config.prefix}broadcast all <message>\` — everyone\n\n` +
        `⚠️ _Use responsibly — this pings every known contact._`,
      footer: `🌸 ${config.botName}`,
      buttons: [quickReply('❌ Cancel', 'ping')],
    }, rawMessage);
  }

  // Build JID lists
  const userJids  = target !== 'groups'
    ? db.prepare('SELECT jid FROM users WHERE isBanned=0').all().map(r => r.jid)
    : [];
  const groupJids = target !== 'users'
    ? db.prepare('SELECT jid FROM groups').all().map(r => r.jid)
    : [];

  const all    = [...userJids, ...groupJids];
  const total  = all.length;

  if (!total) return ctx.reply('❌ No recipients found in database.');

  await ctx.reply(`📢 Broadcasting to *${total}* recipient(s)...\n\n_Message:_ ${message.slice(0,100)}${message.length > 100 ? '…' : ''}`);

  const text =
    `📢 *Broadcast from ${config.botName}*\n\n` +
    `${message}\n\n` +
    `_— ${config.botName} · ${new Date().toUTCString()}_`;

  let ok = 0, fail = 0;
  for (const recipient of all) {
    const sent = await trySend(sock, recipient, text);
    if (sent) ok++; else fail++;
    // Small delay to avoid flooding
    await new Promise(r => setTimeout(r, 500));
  }

  log.info(`[broadcast] Done: ${ok} sent, ${fail} failed — total ${total}`);
  await ctx.reply(`✅ Broadcast complete!\n• Sent: *${ok}*\n• Failed: *${fail}*\n• Total: *${total}*`);
}
