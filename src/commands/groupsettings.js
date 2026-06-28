/**
 * Command: groupsettings (and grouped subcommand aliases)
 *
 * Group feature toggles and config — all require admin permission.
 *
 * Subcommands (via aliases):
 *   .welcome on|off          toggle welcome messages
 *   .setwelcome <msg>        set custom welcome text ({name} = new member name)
 *   .goodbye on|off          toggle goodbye messages
 *   .setgoodbye <msg>        set custom goodbye text ({name} = leaving member)
 *   .antilink on|off         toggle link-deletion protection
 *   .antispam on|off         toggle antispam protection
 *   .nsfw on|off             toggle NSFW mode flag for this group
 *   .mute                    restrict group (only admins can send messages)
 *   .unmute                  open group (everyone can send)
 *   .lock                    lock group info (only admins can edit)
 *   .unlock                  unlock group info
 *   .groupinfo               show current group settings & stats (public access)
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import {
  getGroup, upsertGroup, setGroupSetting,
} from '../database/store.js';
import { config } from '../config/index.js';
import { log }   from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';

export const meta = {
  name:        'groupsettings',
  description: 'Group feature toggles — welcome, antilink, mute, lock, nsfw, and more',
  category:    'group',
  aliases:     [
    'welcome', 'setwelcome',
    'goodbye', 'setgoodbye',
    'antilink', 'antispam',
    'nsfw',
    'mute', 'unmute',
    'lock', 'unlock',
    'groupinfo',
  ],
  cooldown:    3,
  permission:  'admin',
};

// groupinfo is public — override perm inside handler
const PUBLIC_SUBS = new Set(['groupinfo']);

// ── helpers ──────────────────────────────────────────────────────────────────

function onOff(arg) {
  if (['on','enable','yes','true','1'].includes(arg?.toLowerCase())) return true;
  if (['off','disable','no','false','0'].includes(arg?.toLowerCase())) return false;
  return null;
}

function boolStr(v) { return v ? '✅ On' : '❌ Off'; }

// ── main handler ─────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { sock, chat: jid, rawMessage, command, args, fullArgs } = ctx;

  if (!ctx.isGroup) return ctx.reply('❌ This command only works in groups.');

  // Fetch or init group record
  let grp = getGroup(normalizeJid(jid));
  if (!grp) {
    upsertGroup(normalizeJid(jid), {});
    grp = getGroup(normalizeJid(jid)) ?? {};
  }

  // ── .groupinfo — public ────────────────────────────────────────────────
  if (command === 'groupinfo') {
    let meta2;
    try { meta2 = await sock.groupMetadata(jid); } catch { meta2 = null; }

    const name  = grp.name || meta2?.subject || 'Unknown';
    const count = meta2?.participants?.length ?? grp.participantCount ?? '?';
    const desc  = grp.description || meta2?.desc || 'No description';

    const body =
      `📋 *Group Info*\n\n` +
      `*Name:* ${name}\n` +
      `*Members:* ${count}\n` +
      `*Description:* ${desc.slice(0, 200)}\n\n` +
      `*Toggles*\n` +
      `• Welcome:   ${boolStr(grp.welcomeEnabled)}\n` +
      `• Goodbye:   ${boolStr(grp.goodbyeEnabled)}\n` +
      `• Antilink:  ${boolStr(grp.antilinkEnabled)}\n` +
      `• Antispam:  ${boolStr(grp.antispamEnabled)}\n` +
      `• NSFW:      ${boolStr(grp.nsfw)}\n` +
      `• Locked:    ${boolStr(grp.isLocked)}`;

    return sendInteractive(sock, jid, {
      header: '📊 Group Settings',
      body,
      footer: `🌸 ${config.botName}`,
      buttons: [
        quickReply('🔗 Get Link',  'link'),
        quickReply('👥 Tag All',   'tagall'),
      ],
    }, rawMessage);
  }

  // ── .welcome on|off ────────────────────────────────────────────────────
  if (command === 'welcome') {
    const val = onOff(args[0]);
    if (val === null) return ctx.reply(`Usage: \`${config.prefix}welcome on\` or \`off\``);
    setGroupSetting(normalizeJid(jid), 'welcomeEnabled', val ? 1 : 0);
    log.info(`[group] welcomeEnabled=${val} for ${jid}`);
    return ctx.reply(`✅ Welcome messages *${val ? 'enabled' : 'disabled'}* for this group.`);
  }

  // ── .setwelcome <msg> ──────────────────────────────────────────────────
  if (command === 'setwelcome') {
    const msg = fullArgs.trim();
    if (!msg) return ctx.reply(`Usage: \`${config.prefix}setwelcome Hello {name}, welcome!\`\n_Use {name} for the new member's name._`);
    setGroupSetting(normalizeJid(jid), 'welcomeMsg', msg);
    setGroupSetting(normalizeJid(jid), 'welcomeEnabled', 1);
    return ctx.reply(`✅ Welcome message set and *enabled*:\n\n_"${msg}"_`);
  }

  // ── .goodbye on|off ────────────────────────────────────────────────────
  if (command === 'goodbye') {
    const val = onOff(args[0]);
    if (val === null) return ctx.reply(`Usage: \`${config.prefix}goodbye on\` or \`off\``);
    setGroupSetting(normalizeJid(jid), 'goodbyeEnabled', val ? 1 : 0);
    return ctx.reply(`✅ Goodbye messages *${val ? 'enabled' : 'disabled'}* for this group.`);
  }

  // ── .setgoodbye <msg> ─────────────────────────────────────────────────
  if (command === 'setgoodbye') {
    const msg = fullArgs.trim();
    if (!msg) return ctx.reply(`Usage: \`${config.prefix}setgoodbye Goodbye {name}, we'll miss you!\`\n_Use {name} for the leaving member's name._`);
    setGroupSetting(normalizeJid(jid), 'goodbyeMsg', msg);
    setGroupSetting(normalizeJid(jid), 'goodbyeEnabled', 1);
    return ctx.reply(`✅ Goodbye message set and *enabled*:\n\n_"${msg}"_`);
  }

  // ── .antilink on|off ───────────────────────────────────────────────────
  if (command === 'antilink') {
    const val = onOff(args[0]);
    if (val === null) return ctx.reply(`Usage: \`${config.prefix}antilink on\` or \`off\``);
    setGroupSetting(normalizeJid(jid), 'antilinkEnabled', val ? 1 : 0);
    return ctx.reply(`✅ Antilink protection *${val ? 'enabled' : 'disabled'}* for this group.\n${val ? '_Links shared by non-admins will be automatically deleted._' : ''}`);
  }

  // ── .antispam on|off ───────────────────────────────────────────────────
  if (command === 'antispam') {
    const val = onOff(args[0]);
    if (val === null) return ctx.reply(`Usage: \`${config.prefix}antispam on\` or \`off\``);
    setGroupSetting(normalizeJid(jid), 'antispamEnabled', val ? 1 : 0);
    return ctx.reply(`✅ Antispam *${val ? 'enabled' : 'disabled'}* for this group.`);
  }

  // ── .nsfw on|off ───────────────────────────────────────────────────────
  if (command === 'nsfw') {
    const val = onOff(args[0]);
    if (val === null) return ctx.reply(`Usage: \`${config.prefix}nsfw on\` or \`off\``);
    setGroupSetting(normalizeJid(jid), 'nsfw', val ? 1 : 0);
    return ctx.reply(`✅ NSFW mode *${val ? 'enabled' : 'disabled'}* for this group.`);
  }

  // ── .mute / .unmute ───────────────────────────────────────────────────
  if (command === 'mute' || command === 'unmute') {
    const announce = command === 'mute'; // announce=true → only admins can send
    try {
      await sock.groupSettingUpdate(jid, announce ? 'announcement' : 'not_announcement');
      return ctx.reply(announce
        ? '🔇 Group muted — only admins can send messages now.'
        : '🔊 Group unmuted — everyone can send messages now.'
      );
    } catch (e) {
      return ctx.reply(`❌ Failed: ${e.message}`);
    }
  }

  // ── .lock / .unlock ───────────────────────────────────────────────────
  if (command === 'lock' || command === 'unlock') {
    const restrict = command === 'lock';
    try {
      await sock.groupSettingUpdate(jid, restrict ? 'locked' : 'unlocked');
      setGroupSetting(normalizeJid(jid), 'isLocked', restrict ? 1 : 0);
      return ctx.reply(restrict
        ? '🔒 Group locked — only admins can edit group info.'
        : '🔓 Group unlocked — all participants can edit group info.'
      );
    } catch (e) {
      return ctx.reply(`❌ Failed: ${e.message}`);
    }
  }

  // Fallback help
  return sendInteractive(sock, jid, {
    header: '⚙️ Group Settings',
    body:
      `Manage this group with:\n\n` +
      `• \`${config.prefix}welcome on/off\` — welcome messages\n` +
      `• \`${config.prefix}setwelcome <msg>\` — custom welcome\n` +
      `• \`${config.prefix}goodbye on/off\` — goodbye messages\n` +
      `• \`${config.prefix}antilink on/off\` — link protection\n` +
      `• \`${config.prefix}antispam on/off\` — spam protection\n` +
      `• \`${config.prefix}nsfw on/off\` — NSFW toggle\n` +
      `• \`${config.prefix}mute / unmute\` — restrict messaging\n` +
      `• \`${config.prefix}lock / unlock\` — restrict group edits\n` +
      `• \`${config.prefix}groupinfo\` — view settings`,
    footer: `🌸 ${config.botName}`,
    buttons: [quickReply('📊 Group Info', 'groupinfo')],
  }, rawMessage);
}
