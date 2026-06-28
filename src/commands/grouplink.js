/**
 * Command: link / revoke
 * Get or revoke the group invite link.
 *
 * Usage:
 *   .link    — get current invite link
 *   .revoke  — revoke current link and generate a new one
 *
 * Permission: admin
 */
import { sendInteractive, ctaUrl, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';
import { log }   from '../utils/logger.js';

export const meta = {
  name:        'link',
  description: 'Get or revoke the group invite link',
  category:    'group',
  aliases:     ['revoke', 'grouplink', 'invitelink'],
  cooldown:    5,
  permission:  'admin',
};

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, command } = ctx;

  if (!ctx.isGroup) return ctx.reply('❌ This command only works in groups.');

  if (command === 'revoke') {
    try {
      await sock.groupRevokeInvite(jid);
      log.info(`[grouplink] Invite link revoked for ${jid}`);
    } catch (e) {
      return ctx.reply(`❌ Failed to revoke link: ${e.message}`);
    }
  }

  let inviteCode;
  try {
    inviteCode = await sock.groupInviteCode(jid);
  } catch (e) {
    return ctx.reply(`❌ Could not get invite link: ${e.message}`);
  }

  const link = `https://chat.whatsapp.com/${inviteCode}`;

  await sendInteractive(sock, jid, {
    header:  command === 'revoke' ? '🔄 New Invite Link' : '🔗 Group Invite Link',
    body:    `${link}\n\n${command === 'revoke' ? '_Old link has been revoked._' : '_Share this link to invite others._'}`,
    footer:  `🌸 ${config.botName}`,
    buttons: [
      ctaUrl('🔗 Open Link', link),
      quickReply('🔄 Revoke Link', 'revoke'),
    ],
  }, rawMessage);
}
