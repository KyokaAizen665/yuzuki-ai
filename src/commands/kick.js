/**
 * Command: kick
 * Remove one or more participants from a group.
 *
 * Usage:
 *   .kick @user1 @user2   — kick mentioned users
 *   .kick (reply to msg)  — kick the quoted message sender
 *
 * Aliases: remove, boot
 * Permission: admin
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';
import { log }   from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';

export const meta = {
  name:        'kick',
  description: 'Remove participant(s) from the group',
  category:    'group',
  aliases:     ['remove', 'boot'],
  cooldown:    3,
  permission:  'admin',
};

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, quoted, sender } = ctx;

  if (!ctx.isGroup) return ctx.reply('❌ This command only works in groups.');

  // Collect targets: mentioned JIDs + quoted sender
  const mentioned = rawMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const targets   = new Set(mentioned.map(normalizeJid));
  if (quoted?.sender) targets.add(normalizeJid(quoted.sender));

  if (!targets.size) {
    return sendInteractive(sock, jid, {
      header: '👢 Kick',
      body:   `*Usage*\n\`${config.prefix}kick @user\`\nOr reply to a message to kick that sender.\n\n_Requires bot to be group admin._`,
      footer: `🌸 ${config.botName}`,
      buttons: [quickReply('📋 Help', 'open_menu')],
    }, rawMessage);
  }

  // Verify bot is admin
  let botJid;
  try {
    const info = await sock.groupMetadata(jid);
    botJid = normalizeJid(sock.user.id);
    const botParticipant = info.participants.find(p => normalizeJid(p.id) === botJid);
    if (!botParticipant?.admin) {
      return ctx.reply('❌ I need to be a group admin to kick members.');
    }
  } catch (e) {
    return ctx.reply(`❌ Could not fetch group info: ${e.message}`);
  }

  const results = [];
  for (const target of targets) {
    if (normalizeJid(target) === botJid) { results.push(`⚠️ Cannot kick myself`); continue; }
    try {
      await sock.groupParticipantsUpdate(jid, [target], 'remove');
      results.push(`✅ Kicked @${target.split('@')[0]}`);
      log.info(`[kick] ${sender} kicked ${target} from ${jid}`);
    } catch (e) {
      results.push(`❌ Failed for @${target.split('@')[0]}: ${e.message}`);
    }
  }

  await ctx.reply(results.join('\n'));
}
