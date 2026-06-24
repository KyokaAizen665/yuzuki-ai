/**
 * Command: gemini
 *
 * Google Gemini dedicated interface.
 * Forces the Gemini provider for every call (forceProvider: 'gemini').
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
import { aiRateLimiter }     from '../services/rate-limiter.js';
import { config }            from '../config/index.js';
import {
  sendNativeAIResponse,
  sendInteractiveWithImage,
  sendReaction,
  quickReply,
  parseAIText,
} from '../services/rich-messages.js';
import { getRandomHeroImage } from '../services/hero-images.js';

export const meta = {
  name:        'gemini',
  description: 'Chat with Google Gemini directly',
  category:    'ai',
  aliases:     ['gem', 'bard'],
  cooldown:    4,
  owner:       false,
  premium:     false,
  group:       null,
};

const BRAND_FOOTER = 'Yuzuki AI • Google Gemini';

export async function handler(ctx) {
  const { args, chat: chatJid, sender, pushName, isOwner, sock, rawMessage } = ctx;

  await initAI();

  // ── Key not configured ────────────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    return sendInteractiveWithImage(sock, chatJid, {
      header:  '⚡ Google Gemini',
      image:   getRandomHeroImage('ai'),
      body:
        `Gemini is not configured.\n\n` +
        `To enable it:\n` +
        `1. Get a free key at aistudio.google.com\n` +
        `2. Set GEMINI_API_KEY in your .env file\n` +
        `3. Restart the bot\n\n` +
        `_AI is still available via the fallback provider._`,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('🤖 Use AI instead', 'cmd_ai'    ),
        quickReply('📊 Check Status',   'ai_status' ),
      ],
    }, rawMessage);
  }

  const prompt = args.join(' ').trim();

  // ── No-args: Gemini info card ─────────────────────────────────────────────
  if (!prompt) {
    const p = config.prefix;

    try {
      await sock.sendMessage(
        chatJid,
        {
          image:      getRandomHeroImage('ai'),
          caption:
            `Google Gemini is connected.\n\n` +
            `Send any message and Gemini will respond directly.\n\n` +
            `_Examples:_\n` +
            `• Explain neural networks\n` +
            `• Write a Rust function\n` +
            `• Translate to Japanese`,
          nativeFlow: [
            { text: '📊 AI Status', id: 'ai_status' },
            { text: '← Menu',      id: 'back_menu' },
          ],
          footer:    BRAND_FOOTER,
          offerText: '⚡ Gemini 2.0 Flash connected',
        },
        rawMessage ? { quoted: rawMessage } : {},
      );
    } catch {
      await ctx.reply(
        `⚡ *Google Gemini*\n\nSend \`${p}gemini <message>\` to chat with Gemini directly.`
      );
    }
    return;
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

  let result;
  try {
    result = await chat(chatJid, sender, prompt, {
      senderName:    pushName ?? sender,
      forceProvider: 'gemini',
    });
  } catch (err) {
    try { await sock.sendPresenceUpdate('paused', chatJid); } catch {}
    try { await sendReaction(sock, chatJid, ctx.key, '❌'); } catch {}
    return sendInteractiveWithImage(sock, chatJid, {
      header:  '⚠️ Gemini Unavailable',
      image:   getRandomHeroImage('ai'),
      body:    `Gemini could not respond at this time.\n\n_${err.message}_\n\nUse the main AI command which falls back automatically.`,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('🤖 Use AI instead', 'cmd_ai'    ),
        quickReply('← Menu',           'back_menu' ),
      ],
    }, rawMessage);
  }

  try { await sock.sendPresenceUpdate('paused', chatJid); } catch {}
  const parsed = parseAIText(result.text);
  try {
    await sendReaction(sock, chatJid, ctx.key, parsed.codeBlocks.length ? '💻' : '⚡');
  } catch {}

  const suggestedPrompts = parsed.codeBlocks.length
    ? ['Explain this code', 'Improve it', 'Add comments']
    : ['Continue', 'Explain more', 'Simplify', 'Give example'];

  await sendNativeAIResponse(sock, chatJid, {
    text:             parsed.text,
    codeBlocks:       parsed.codeBlocks,
    suggestedPrompts,
    model:            result.model,
    provider:         result.provider,
    tokens:           result.tokens,
  }, rawMessage);
}
