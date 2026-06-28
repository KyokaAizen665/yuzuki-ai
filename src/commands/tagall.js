/**
 * Command: tagall
 * Mention every participant in a group.
 *
 * Usage:
 *   .tagall              — tag all with default message
 *   .tagall <message>    — tag all with custom message
 *
 * Aliases: tag, mentionall, everyone
 * Permission: admin
 */
import { normalizeJid } from '../utils/jid.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'tagall',
  description: 'Mention every participant in the group',
  category:    'group',
  aliases:     ['tag', 'mentionall', 'everyone'],
  cooldown:    10,
  permission:  'admin',
};

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, fullArgs } = ctx;

  if (!ctx.isGroup) return ctx.reply('❌ This command only works in groups.');

  let meta;
  try {
    meta = await sock.groupMetadata(jid);
  } catch (e) {
    return ctx.reply(`❌ Could not fetch group info: ${e.message}`);
  }

  const participants = meta.participants ?? [];
  const mentions     = participants.map(p => normalizeJid(p.id));

  const customMsg = fullArgs.trim();
  const header    = customMsg || '📢 Attention everyone!';

  const lines = mentions.map(m => `@${m.split('@')[0]}`).join(' ');
  const text  = `${header}\n\n${lines}`;

  await sock.sendMessage(jid, { text, mentions }, { quoted: rawMessage });
}
