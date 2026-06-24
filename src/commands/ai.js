/**
 * Command: ai
 *
 * Natural-language chat — rich AI responses with code detection, reactions,
 * and suggested prompts. Phase 8 upgrade.
 * Supports multiple providers (Groq, Gemini, OpenRouter, Pollinations).
 *
 * Usage:
 *   .ai <message>        — send a message and get a reply
 *   .ai clear            — clear conversation history for this chat
 *   .ai status           — show provider, model, and history info
 *   .ai provider         — list and switch AI providers
 *   .ai provider <name>  — switch to a specific provider (owner)
 *   .ai on               — enable AI in this chat (owner only)
 *   .ai off              — disable AI in this chat (owner only)
 *   .ai dmon             — enable passive DM mode (owner only)
 *   .ai dmoff            — disable passive DM mode (owner only)
 *   .ai personality      — list personalities
 *   .ai personality <k>  — set personality (owner only)
 *
 * Aliases: gpt, chat, ask
 */
import {
  chat,
  clearHistory,
  getHistoryCount,
  isAIEnabledForChat,
  isAIEnabled,
  isPassiveDMEnabled,
  setAIForChat,
  setPassiveDM,
  AIManager,
  initAI,
} from '../services/ai.js';
import { aiRateLimiter }    from '../services/rate-limiter.js';
import { config }           from '../config/index.js';
import { setSetting }       from '../database/store.js';
import { getPersonalities } from '../services/ai/PromptManager.js';
import {
  sendAIRichResponse,
  sendInteractive,
  sendInteractiveWithImage,
  sendReaction,
  quickReply,
  ctaUrl,
  parseAIText,
} from '../services/rich-messages.js';
import { getRandomHeroImage } from '../services/hero-images.js';

export const meta = {
  name:        'ai',
  description: 'Chat with the AI. Subcommands: clear, status, provider, personality, on, off, dmon, dmoff',
  category:    'ai',
  aliases:     ['gpt', 'chat', 'ask'],
  cooldown:    3,
  owner:       false,
  premium:     false,
  group:       null,
};

export async function handler(ctx) {
  const { args, chat: chatJid, sender, pushName, isOwner } = ctx;

  // Ensure AI system is initialized
  await initAI();

  const sub = args[0]?.toLowerCase();

  // ── .ai clear / .ai reset ─────────────────────────────────────────────────
  if (sub === 'clear' || sub === 'reset') {
    const deleted = clearHistory(chatJid);
    return ctx.reply(`🗑️ Cleared *${deleted}* message(s) from AI history for this chat.`);
  }

  // ── .ai status ────────────────────────────────────────────────────────────
  if (sub === 'status') {
    const enabled    = isAIEnabledForChat(chatJid);
    const globalOn   = isAIEnabled();
    const passiveDM  = isPassiveDMEnabled();
    const histCount  = getHistoryCount(chatJid);
    const providers  = AIManager.getAvailableProviders();
    const active     = AIManager.getActiveProvider();

    const providerLines = providers.map(p =>
      `  ${p.active ? '▶' : ' '} *${p.name}* — ${p.displayName}${p.requiresKey ? '' : ' 🆓'}`
    ).join('\n');

    return ctx.reply(
      `🤖 *AI Status — Phase 6*\n\n` +
      `• Global AI:   ${globalOn  ? '✅ enabled'    : '❌ disabled'}\n` +
      `• This chat:   ${enabled   ? '✅ enabled'    : '❌ disabled'}\n` +
      `• Passive DM:  ${passiveDM ? '✅ on'         : '⭕ off'}\n` +
      `• Active:      ${active ?? 'none'}\n` +
      `• History:     ${histCount} messages\n\n` +
      `*Available providers:*\n${providerLines || '  (none configured)'}\n\n` +
      `🆓 = zero API key required`
    );
  }

  // ── .ai provider [name] ───────────────────────────────────────────────────
  if (sub === 'provider') {
    const target = args[1]?.toLowerCase();

    if (!target) {
      const providers = AIManager.getAvailableProviders();
      const active    = AIManager.getActiveProvider();
      const lines     = providers.map(p =>
        `${p.active ? '▶' : '•'} *${p.name}* — ${p.displayName}${p.free ? ' (free)' : ''}${p.requiresKey ? '' : ' 🆓'}`
      );
      return ctx.reply(
        `🤖 *AI Providers*\n\n${lines.join('\n') || 'No providers available.'}\n\n` +
        `Active: *${active ?? 'none'}*\n` +
        `Use \`.ai provider <name>\` to switch (owner only).`
      );
    }

    if (!isOwner) return ctx.reply('👑 Only the bot owner can switch AI providers.');
    const ok = AIManager.setProvider(target);
    return ctx.reply(ok
      ? `✅ AI provider switched to *${target}*.`
      : `❌ Provider *${target}* is not available. Use \`.ai provider\` to list available providers.`
    );
  }

  // ── .ai personality [key] ─────────────────────────────────────────────────
  if (sub === 'personality') {
    const key = args[1]?.toLowerCase();
    const personalities = getPersonalities();

    if (!key) {
      const lines = personalities.map(p =>
        `• *${p.key}* — ${p.displayName}`
      );
      return ctx.reply(
        `🎭 *AI Personalities*\n\n${lines.join('\n')}\n\n` +
        `Use \`.ai personality <key>\` to switch (owner only).`
      );
    }

    if (!isOwner) return ctx.reply('👑 Only the bot owner can change the AI personality.');
    const valid = personalities.find(p => p.key === key);
    if (!valid) return ctx.reply(`❌ Unknown personality *${key}*. Use \`.ai personality\` to list options.`);
    setSetting('ai_personality', key);
    return ctx.reply(`✅ Personality set to *${valid.displayName}*.`);
  }

  // ── .ai on / .ai off — owner only ─────────────────────────────────────────
  if (sub === 'on' || sub === 'off') {
    if (!isOwner) return ctx.reply('👑 Only the bot owner can change AI settings.');
    setAIForChat(chatJid, sub === 'on');
    return ctx.reply(sub === 'on'
      ? '✅ AI chat is now *enabled* for this chat.'
      : '❌ AI chat is now *disabled* for this chat.');
  }

  // ── .ai dmon / .ai dmoff — owner only ─────────────────────────────────────
  if (sub === 'dmon' || sub === 'dmoff') {
    if (!isOwner) return ctx.reply('👑 Only the bot owner can toggle passive DM mode.');
    setPassiveDM(sub === 'dmon');
    return ctx.reply(sub === 'dmon'
      ? '✅ Passive DM mode *enabled* — I will reply to all DMs without a prefix.'
      : '⭕ Passive DM mode *disabled* — DMs require the command prefix.');
  }

  // ── Main chat flow ─────────────────────────────────────────────────────────

  const prompt = args.join(' ').trim();

  if (!prompt) {
    const active = AIManager.getActiveProvider();
    const p = config.prefix;
    return sendInteractiveWithImage(ctx.sock, chatJid, {
      header:  `🤖 ${config.botName} AI`,
      image:   getRandomHeroImage('ai'),
      body:
        `Provider: *${active ?? 'none configured'}*\n\n` +
        `Just send me a message and I'll reply! Try:\n` +
        `• _"Explain quantum computing"_\n` +
        `• _"Write a Python hello world"_\n` +
        `• _"Summarize machine learning"_`,
      footer:  `🌸 ${config.botName ?? 'Yuzuki AI'}`,
      buttons: [
        quickReply('🧹 Clear History', 'ai_clear'),
        quickReply('📊 AI Status',     'ai_status'),
        quickReply('🎭 Personalities', 'ai_personality'),
      ],
    }, ctx.rawMessage);
  }

  if (!isAIEnabledForChat(chatJid)) {
    return ctx.reply('❌ AI chat is currently disabled for this chat.');
  }

  const rl = aiRateLimiter.check(sender, isOwner);
  if (!rl.allowed) {
    return ctx.reply(`⏳ Too fast — please wait *${rl.resetIn}s* before chatting again.`);
  }

  // Signal we received the message
  try { await sendReaction(ctx.sock, chatJid, ctx.key, '✨'); } catch { /* best-effort */ }
  try { await ctx.sock.sendPresenceUpdate('composing', chatJid); } catch { /* best-effort */ }

  let result;
  try {
    result = await chat(chatJid, sender, prompt, {
      senderName: pushName ?? sender,
    });
  } catch (err) {
    try { await ctx.sock.sendPresenceUpdate('paused', chatJid); } catch {}
    try { await sendReaction(ctx.sock, chatJid, ctx.key, '❌'); } catch {}
    return ctx.reply(`⚠️ AI error: ${err.message}`);
  }

  try { await ctx.sock.sendPresenceUpdate('paused', chatJid); } catch {}
  // React: ✅ for normal text, 💻 when response has code
  const parsed = parseAIText(result.text);
  try { await sendReaction(ctx.sock, chatJid, ctx.key, parsed.codeBlocks.length ? '💻' : '✅'); } catch {}

  // Choose suggested prompts based on response type
  const suggestedPrompts = parsed.codeBlocks.length
    ? ['Explain this code', 'Improve it', 'Add comments']
    : ['Continue', 'Explain more', 'Simplify', 'Give example'];

  // Send rich AI response with code detection + suggested prompts
  await sendAIRichResponse(ctx.sock, chatJid, {
    text:            parsed.text,
    codeBlocks:      parsed.codeBlocks,
    suggestedPrompts,
    model:           result.model,
    provider:        result.provider,
    tokens:          result.tokens,
  }, ctx.rawMessage);
}
