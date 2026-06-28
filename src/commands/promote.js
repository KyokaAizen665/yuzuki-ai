/**
 * Command: promote / demote
 * Promote or demote group participants.
 *
 * Usage:
 *   .promote @user   — make admin
 *   .demote  @user   — remove admin
 *   (also works by replying to a message)
 *
 * Permission: admin
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';
import { log }   from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';

export const meta = {
  name:        'promote',
  description: 'Promote or demote group participants',
  category:    'group',
  aliases:     ['demote'],
  cooldown:    3,
  permission:  'admin',
};

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, quoted, command } = ctx;
  const action = command === 'demote' ? 'demote' : 'promote';
  const label  = action === 'promote' ? '⬆️ Promote' : '⬇️ Demote';

  if (!ctx.isGroup) return ctx.reply('❌ This command only works in groups.');

  const mentioned = rawMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const targets   = new Set(mentioned.map(normalizeJid));
  if (quoted?.sender) targets.add(normalizeJid(quoted.sender));

  if (!targets.size) {
    return sendInteractive(sock, jid, {
      header: label,
      body:   `*Usage*\n\`${config.prefix}${action} @user\`\nOr reply to a message.\n\n_Requires bot to be group admin._`,
      footer: `🌸 ${config.botName}`,
      buttons: [quickReply('📋 Help', 'open_menu')],
    }, rawMessage);
  }

  // Verify bot is admin
  try {
    const info = await sock.groupMetadata(jid);
    const botJid = normalizeJid(sock.user.id);
    const bot = info.participants.find(p => normalizeJid(p.id) === botJid);
    if (!bot?.admin) return ctx.reply('❌ I need to be a group admin to promote/demote members.');
  } catch (e) {
    return ctx.reply(`❌ Could not fetch group info: ${e.message}`);
  }

  const results = [];
  for (const target of targets) {
    try {
      await sock.groupParticipantsUpdate(jid, [target], action);
      const name = `@${target.split('@')[0]}`;
      results.push(action === 'promote' ? `✅ ${name} promoted to admin` : `✅ ${name} demoted from admin`);
      log.info(`[${action}] ${target} in ${jid}`);
    } catch (e) {
      results.push(`❌ Failed for @${target.split('@')[0]}: ${e.message}`);
    }
  }

  await ctx.reply(results.join('\n'));
}
