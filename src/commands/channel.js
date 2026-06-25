/**
 * Command: channel — Phase 9 upgrade
 *
 * PATCH: sendTable() (ASCII box-drawing) replaced by renderTable()
 *        from services/table-renderer.js. Channel metadata now renders
 *        as NativeFlow interactive cards — no ASCII art.
 *
 * Newsletter / WhatsApp Channel management.
 *
 * Usage:
 *   .channel              — show Yuzuki official channel info
 *   .channel info <jid>   — get info about any channel JID
 *   .channel follow <jid> — follow a channel
 *   .channel unfollow <jid> — unfollow a channel
 *   .channel mute <jid>   — mute channel updates
 *   .channel unmute <jid> — unmute channel updates
 *
 * Aliases: newsletter, nl
 */
import {
  sendInteractive,
  quickReply,
} from '../services/rich-messages.js';
import { renderTable }          from '../services/table-renderer.js';
import { getRandomHeroImage }   from '../services/hero-images.js';
import { getNewsletterService } from '../services/newsletter.js';
import { config }               from '../config/index.js';
import { log }                  from '../utils/logger.js';

export const meta = {
  name:        'channel',
  description: 'Manage WhatsApp channels — follow, unfollow, get info',
  category:    'utility',
  aliases:     ['newsletter', 'nl'],
  cooldown:    5,
  permission:  'public',
};

const BRAND_FOOTER = `🌸 ${config.botName ?? 'Yuzuki AI'}`;

const OFFICIAL_CHANNEL_JID = config.officialChannelJid ?? null;

const USAGE_TEXT =
  `📢 *Channel Commands*\n\n` +
  `• \`.channel\` — official Yuzuki info\n` +
  `• \`.channel info <jid>\` — get channel details\n` +
  `• \`.channel follow <jid>\` — follow a channel\n` +
  `• \`.channel unfollow <jid>\` — unfollow\n` +
  `• \`.channel mute <jid>\` — mute updates\n` +
  `• \`.channel unmute <jid>\` — unmute`;

function isNewsletterJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@newsletter');
}

export async function handler(ctx) {
  const { args, sock, chat: jid, rawMessage, isOwner } = ctx;
  const sub = args[0]?.toLowerCase();

  function ns() {
    try { return getNewsletterService(); } catch { return null; }
  }

  // ── .channel (no args) — show official Yuzuki channel ────────────────────
  if (!sub) {
    const buttons = [quickReply('📋 Commands', 'open_menu')];
    if (OFFICIAL_CHANNEL_JID) buttons.unshift(quickReply('📢 Follow Yuzuki', 'follow_official'));

    await sendInteractive(sock, jid, {
      header:       '🌸 Yuzuki AI',
      contextImage: getRandomHeroImage('channel'),
      body:
        `*The official Yuzuki AI channel.*\n\n` +
        `Stay updated with:\n` +
        `• New features & commands\n` +
        `• AI upgrades\n` +
        `• Bot announcements\n\n` +
        (OFFICIAL_CHANNEL_JID
          ? `Channel JID:\n\`${OFFICIAL_CHANNEL_JID}\``
          : `_Official channel coming soon!_`),
      footer:  BRAND_FOOTER,
      buttons,
    }, rawMessage);

    if (OFFICIAL_CHANNEL_JID) {
      try {
        const svc  = ns();
        const info = svc ? await svc.metadata('jid', OFFICIAL_CHANNEL_JID) : null;
        if (info) {
          await renderTable(ctx, {
            title:   'Official Channel Stats',
            columns: ['Field', 'Value'],
            rows: [
              ['📛 Name',        info.name ?? 'Yuzuki AI'],
              ['👥 Subscribers', String(info.subscriberCount ?? '—')],
              ['✅ Verified',    info.verified ? 'Yes' : 'No'],
            ],
            footer: BRAND_FOOTER,
          });
        }
      } catch (e) {
        log.debug(`[channel] Official channel metadata failed: ${e.message}`);
      }
    }
    return;
  }

  // ── .channel info <jid> ───────────────────────────────────────────────────
  if (sub === 'info') {
    const channelJid = args[1];
    if (!channelJid) {
      return sendInteractive(sock, jid, {
        body:    `Please provide a channel JID.\n\`.channel info <jid>\``,
        footer:  BRAND_FOOTER,
        buttons: [quickReply('❓ Help', 'help_channel')],
      }, rawMessage);
    }
    if (!isNewsletterJid(channelJid)) {
      return ctx.reply(`❌ Invalid channel JID — must end in \`@newsletter\`.\n\nExample: \`12345@newsletter\``);
    }
    try {
      await ctx.react('🔍');
      const svc  = ns();
      if (!svc) return ctx.reply('⚠️ Newsletter service unavailable right now.');
      const info = await svc.metadata('jid', channelJid);
      if (!info) return ctx.reply('❌ Channel not found or inaccessible.');

      await renderTable(ctx, {
        title:   `Channel: ${info.name ?? channelJid}`,
        columns: ['Field', 'Value'],
        rows: [
          ['📛 Name',        info.name ?? '—'],
          ['📝 Description', (info.description ?? '—').slice(0, 40)],
          ['👥 Subscribers', String(info.subscriberCount ?? '—')],
          ['✅ Verified',    info.verified ? 'Yes' : 'No'],
        ],
        footer: BRAND_FOOTER,
      });

      await sendInteractive(sock, jid, {
        body:    `_${info.description ?? 'No description'}_`,
        footer:  BRAND_FOOTER,
        buttons: [
          quickReply('📢 Follow', 'ch_follow'),
          quickReply('🔕 Mute',   'ch_mute'),
        ],
      }, rawMessage);
    } catch (e) {
      await ctx.reply(`⚠️ Could not fetch channel info: ${e.message}`);
    }
    return;
  }

  // ── .channel follow <jid> ─────────────────────────────────────────────────
  if (sub === 'follow') {
    const channelJid = args[1];
    if (!channelJid || !isNewsletterJid(channelJid)) {
      return ctx.reply(`❌ Provide a valid channel JID ending in \`@newsletter\`.`);
    }
    try {
      await ctx.react('📢');
      const svc = ns();
      if (!svc) return ctx.reply('⚠️ Newsletter service unavailable.');
      await svc.follow(channelJid);
      await sendInteractive(sock, jid, {
        header:  '✅ Following',
        body:    `You are now following:\n\`${channelJid}\`\n\nYou'll receive updates from this channel.`,
        footer:  BRAND_FOOTER,
        buttons: [quickReply('🔕 Unfollow', 'ch_unfollow')],
      }, rawMessage);
    } catch (e) {
      await ctx.reply(`⚠️ Follow failed: ${e.message}`);
    }
    return;
  }

  // ── .channel unfollow <jid> ───────────────────────────────────────────────
  if (sub === 'unfollow') {
    const channelJid = args[1];
    if (!channelJid || !isNewsletterJid(channelJid)) {
      return ctx.reply(`❌ Provide a valid channel JID ending in \`@newsletter\`.`);
    }
    try {
      const svc = ns();
      if (!svc) return ctx.reply('⚠️ Newsletter service unavailable.');
      await svc.unfollow(channelJid);
      await ctx.reply(`✅ Unfollowed \`${channelJid}\`.`);
    } catch (e) {
      await ctx.reply(`⚠️ Unfollow failed: ${e.message}`);
    }
    return;
  }

  // ── .channel mute / unmute <jid> ──────────────────────────────────────────
  if (sub === 'mute' || sub === 'unmute') {
    const channelJid = args[1];
    if (!channelJid || !isNewsletterJid(channelJid)) {
      return ctx.reply(`❌ Provide a valid channel JID ending in \`@newsletter\`.`);
    }
    try {
      const svc = ns();
      if (!svc) return ctx.reply('⚠️ Newsletter service unavailable.');
      if (sub === 'mute') await svc.mute(channelJid);
      else                await svc.unmute(channelJid);
      await ctx.reply(sub === 'mute'
        ? `🔕 Muted updates from \`${channelJid}\`.`
        : `🔔 Unmuted \`${channelJid}\` — you'll receive updates again.`
      );
    } catch (e) {
      await ctx.reply(`⚠️ ${sub === 'mute' ? 'Mute' : 'Unmute'} failed: ${e.message}`);
    }
    return;
  }

  // ── Unknown subcommand ────────────────────────────────────────────────────
  await sendInteractive(sock, jid, {
    header:  '📢 Channel Commands',
    body:    USAGE_TEXT,
    footer:  BRAND_FOOTER,
    buttons: [quickReply('📋 Help Menu', 'open_menu')],
  }, rawMessage);
}