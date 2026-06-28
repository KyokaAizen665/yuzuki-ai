/**
 * Command: groupadmin
 * Advanced group administration — participant management & metadata.
 *
 * Subcommands (via aliases):
 *   .add <number>           — add participant by phone number
 *   .setname <text>         — set group subject/name
 *   .setdesc <text>         — set group description
 *   .groupstats             — detailed group statistics
 *   .pinmsg                 — pin the quoted message
 *
 * Permission: admin (groupstats is public/group)
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { getGroup, upsertGroup, getDatabase } from '../database/store.js';
import { config } from '../config/index.js';
import { log }   from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';

export const meta = {
  name:        'groupadmin',
  description: 'Advanced group management — add members, rename, set description, stats',
  category:    'group',
  aliases:     ['add', 'setname', 'setdesc', 'groupstats', 'pinmsg'],
  cooldown:    5,
  permission:  'admin',
};

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, command, args, fullArgs, quoted } = ctx;

  if (!ctx.isGroup) return ctx.reply('❌ This command only works in groups.');

  // ── .groupstats — slightly relaxed: group perm only ───────────────────────
  if (command === 'groupstats') {
    let meta2;
    try { meta2 = await sock.groupMetadata(jid); } catch { meta2 = null; }

    const db    = getDatabase();
    const grp   = getGroup(normalizeJid(jid)) ?? {};

    // Pull command usage from stats table (best-effort)
    const totalMsgs = db.prepare("SELECT value FROM stats WHERE key='messages_total'").get()?.value ?? 0;
    const totalCmds = db.prepare("SELECT value FROM stats WHERE key='commands_total'").get()?.value ?? 0;

    const memberCount = meta2?.participants?.length ?? grp.participantCount ?? '?';
    const adminCount  = meta2?.participants?.filter(p => p.admin)?.length ?? '?';
    const name        = grp.name || meta2?.subject || 'Unknown';
    const desc        = grp.description || meta2?.desc || 'No description';

    const warns       = db.prepare('SELECT COUNT(*) as n FROM warns WHERE groupJid=?').get(normalizeJid(jid))?.n ?? 0;

    const body =
      `📊 *Group Stats*\n\n` +
      `*Name:* ${name}\n` +
      `*Members:* ${memberCount} (${adminCount} admin${adminCount !== 1 ? 's' : ''})\n` +
      `*Warnings issued:* ${warns}\n\n` +
      `*Bot Stats (global)*\n` +
      `• Messages seen: ${totalMsgs}\n` +
      `• Commands run:  ${totalCmds}\n\n` +
      `*Active Protections*\n` +
      `• Antilink:  ${grp.antilinkEnabled ? '✅' : '❌'}\n` +
      `• Antispam:  ${grp.antispamEnabled ? '✅' : '❌'}\n` +
      `• Welcome:   ${grp.welcomeEnabled  ? '✅' : '❌'}\n` +
      `• Goodbye:   ${grp.goodbyeEnabled  ? '✅' : '❌'}\n` +
      `• Muted:     ${grp.isLocked        ? '✅' : '❌'}`;

    return sendInteractive(sock, jid, {
      header: '📊 Group Stats',
      body,
      footer: `🌸 ${config.botName}`,
      buttons: [
        quickReply('⚙️ Settings', 'groupinfo'),
        quickReply('👥 Tag All',  'tagall'),
      ],
    }, rawMessage);
  }

  // ── .add <number> ─────────────────────────────────────────────────────────
  if (command === 'add') {
    const raw = args[0]?.replace(/\D/g, '');
    if (!raw || raw.length < 7) {
      return ctx.reply(
        `Usage: \`${config.prefix}add <phone number>\`\nExample: \`${config.prefix}add 233501234567\`\n_Include country code, digits only._`
      );
    }
    const target = `${raw}@s.whatsapp.net`;

    // Verify bot is admin
    try {
      const info   = await sock.groupMetadata(jid);
      const botJid = normalizeJid(sock.user.id);
      const bot    = info.participants.find(p => normalizeJid(p.id) === botJid);
      if (!bot?.admin) return ctx.reply('❌ I need to be a group admin to add members.');
    } catch (e) {
      return ctx.reply(`❌ Could not fetch group info: ${e.message}`);
    }

    try {
      const result = await sock.groupParticipantsUpdate(jid, [target], 'add');
      const status = result?.[0]?.status;
      if (status === 200 || !status) {
        log.info(`[add] Added ${target} to ${jid}`);
        return ctx.reply(`✅ Added @${raw} to the group.`);
      }
      // Common status codes: 403 = privacy, 408 = not on WA, 409 = already in group
      const msgs = { 403: 'Their privacy settings prevent being added.', 408: 'Number not on WhatsApp.', 409: 'Already in the group.' };
      return ctx.reply(`⚠️ Could not add @${raw}: ${msgs[status] ?? `Status ${status}`}`);
    } catch (e) {
      return ctx.reply(`❌ Failed to add member: ${e.message}`);
    }
  }

  // ── .setname <text> ───────────────────────────────────────────────────────
  if (command === 'setname') {
    const name = fullArgs.trim();
    if (!name) return ctx.reply(`Usage: \`${config.prefix}setname <new group name>\``);
    if (name.length > 100) return ctx.reply('❌ Group name must be 100 characters or less.');
    try {
      await sock.groupUpdateSubject(jid, name);
      upsertGroup(normalizeJid(jid), { name });
      log.info(`[setname] ${jid} → "${name}"`);
      return ctx.reply(`✅ Group name updated to *${name}*`);
    } catch (e) {
      return ctx.reply(`❌ Failed to update name: ${e.message}`);
    }
  }

  // ── .setdesc <text> ───────────────────────────────────────────────────────
  if (command === 'setdesc') {
    const desc = fullArgs.trim();
    if (!desc) return ctx.reply(`Usage: \`${config.prefix}setdesc <new description>\``);
    if (desc.length > 512) return ctx.reply('❌ Description must be 512 characters or less.');
    try {
      await sock.groupUpdateDescription(jid, desc);
      upsertGroup(normalizeJid(jid), { description: desc });
      log.info(`[setdesc] ${jid} description updated`);
      return ctx.reply(`✅ Group description updated.`);
    } catch (e) {
      return ctx.reply(`❌ Failed to update description: ${e.message}`);
    }
  }

  // ── .pinmsg ───────────────────────────────────────────────────────────────
  if (command === 'pinmsg') {
    if (!quoted?.rawMessage) {
      return ctx.reply(`Usage: Reply to a message then type \`${config.prefix}pinmsg\``);
    }
    try {
      // duration: 86400 = 24h, 604800 = 7 days, 2592000 = 30 days
      await sock.sendMessage(jid, {
        pin: {
          type:     1, // pin
          time:     604800,
          key:      quoted.rawMessage.key,
        },
      });
      return ctx.reply('📌 Message pinned for 7 days.');
    } catch (e) {
      return ctx.reply(`❌ Failed to pin message: ${e.message}`);
    }
  }

  // Fallback help
  return sendInteractive(sock, jid, {
    header: '🛠️ Group Admin Tools',
    body:
      `• \`${config.prefix}add <number>\` — add member\n` +
      `• \`${config.prefix}setname <text>\` — rename group\n` +
      `• \`${config.prefix}setdesc <text>\` — set description\n` +
      `• \`${config.prefix}groupstats\` — detailed stats\n` +
      `• \`${config.prefix}pinmsg\` — pin replied message`,
    footer: `🌸 ${config.botName}`,
    buttons: [quickReply('📊 Group Info', 'groupinfo')],
  }, rawMessage);
}
