/**
 * Command: gemini — Phase 8 upgrade
 *
 * PATCH CHANGES vs previous version:
 *   • Final AI output routes through renderAIResponse() — the single approved
 *     output path. No direct sendNativeAIResponse calls for response content.
 *   • Latency tracked at command level and included in response card.
 *   • Error cards and info cards unchanged (not AI response content).
 *   • No-args info card: replaced box-drawing sendExternalReply with
 *     sendInteractive (consistent with the no-ASCII-art policy).
 *   • BRAND_FOOTER: imported from services/brand.js (single source of truth).
 *
 * Google Gemini dedicated interface.
 * Forces the Gemini provider for every call.
 * If GEMINI_API_KEY is not set → shows a setup card and exits cleanly.
 * If Gemini fails mid-call → shows an error card with .ai fallback option.
 *
 * Aliases: gem, bard
 */
import {
  chat,
  isAIEnabledForChat,
  initAI,
  AIManager,
} from '../services/ai.js';
import { aiRateLimiter }      from '../services/rate-limiter.js';
import { config }             from '../config/index.js';
import {
  sendInteractive,
  sendReaction,
  quickReply,
}                             from '../services/rich-messages.js';
import { getRandomHeroImage } from '../services/hero-images.js';
import { renderAIResponse }   from '../services/ai-renderer.js';
import { BRAND_FOOTER }       from '../services/brand.js';

export const meta = {
  name:        'gemini',
  description: 'Chat with Google Gemini directly',
  category:    'ai',
  aliases:     ['gem', 'bard'],
  cooldown:    4,
  permission:  'public',
};

export async function handler(ctx) {
  const { args, chat: chatJid, sender, pushName, isOwner, sock, rawMessage } = ctx;

  await initAI();

  // ── Key not configured ────────────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    return sendInteractive(sock, chatJid, {
      header:       '⚡ Google Gemini',
      contextImage: getRandomHeroImage('ai'),
      body:
        `Gemini is not configured.\n\n` +
        `To enable it:\n` +
        `1. Get a free key at aistudio.google.com\n` +
        `2. Set GEMINI_API_KEY in your .env file\n` +
        `3. Restart the bot\n\n` +
        `_AI is still available via the fallback provider._`,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('🤖 Use AI instead', 'cmd_ai'   ),
        quickReply('📊 Check Status',   'ai_status'),
      ],
    }, rawMessage);
  }

  const prompt = args.join(' ').trim();

  // ── No-args: Gemini info card ─────────────────────────────────────────────
  if (!prompt) {
    const p = config.prefix;

    return sendInteractive(sock, chatJid, {
      header:       '⚡ Google Gemini',
      contextImage: getRandomHeroImage('ai'),
      body:
        `ɢᴇᴍɪɴɪ 2.0 ꜰʟᴀsʜ ɪs ʀᴇᴀᴅʏ.\n\n` +
        `▸ \`${p}gemini <message>\`\n` +
        `▸ ᴇxᴘʟᴀɪɴ  ·  ᴛʀᴀɴsʟᴀᴛᴇ  ·  ᴅᴇʙᴜɢ`,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('🤖 Try AI Chat',  'cmd_ai'   ),
        quickReply('📊 Check Status', 'ai_status'),
      ],
    }, rawMessage);
  }

  // ── Chat flow: force Gemini ───────────────────────────────────────────────
  if (!isAIEnabledForChat(chatJid)) {
    return ctx.reply('❌ AI chat is currently disabled for this chat.');
  }

  const rl = aiRateLimiter.check(sender, isOwner);
  if (!rl.allowed) {
    return ctx.reply(`⏳ Please wait *${rl.resetIn}s* before sending again.`);
  }

  try { await sendReaction(sock, chatJid, ctx.key, '⚡'); } catch {}
  try { await sock.sendPresenceUpdate('composing', chatJid); } catch {}

  const startMs = Date.now();
  let result;
  try {
    result = await chat(chatJid, sender, prompt, {
      senderName:    pushName ?? sender,
      forceProvider: 'gemini',
    });
  } catch (err) {
    try { await sock.sendPresenceUpdate('paused', chatJid); } catch {}
    try { await sendReaction(sock, chatJid, ctx.key, '❌'); } catch {}
    return sendInteractive(sock, chatJid, {
      header:       '⚠️ Gemini Unavailable',
      contextImage: getRandomHeroImage('ai'),
      body:    `Gemini could not respond at this time.\n\n_${err.message}_\n\nUse the main AI command which falls back automatically.`,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('🤖 Use AI instead', 'cmd_ai'   ),
        quickReply('← Menu',           'back_menu'),
      ],
    }, rawMessage);
  }
  const latency = Date.now() - startMs;

  try { await sock.sendPresenceUpdate('paused', chatJid); } catch {}

  const hasCode = result.text?.includes('```');
  try { await sendReaction(sock, chatJid, ctx.key, hasCode ? '💻' : '⚡'); } catch {}

  await renderAIResponse(ctx, {
    provider:  result.provider,
    model:     result.model,
    prompt,
    response:  result.text,
    latency,
    usage:     { tokens: result.tokens ?? 0 },
  });
}
