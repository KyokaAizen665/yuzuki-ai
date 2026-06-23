/**
 * Command: ai
 *
 * Natural-language chat with the Groq-powered AI.
 * Manages per-chat conversation history and supports subcommands.
 *
 * Usage:
 *   .ai <message>        — send a message and get a reply
 *   .ai clear            — clear conversation history for this chat
 *   .ai status           — show AI status, model, and history count
 *   .ai on               — enable AI in this chat (owner only)
 *   .ai off              — disable AI in this chat (owner only)
 *   .ai dmon             — enable passive DM mode (owner only)
 *   .ai dmoff            — disable passive DM mode (owner only)
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
} from '../services/ai.js';
import { aiRateLimiter } from '../services/rate-limiter.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'ai',
  description: 'Chat with the AI. Use subcommands: clear, status, on, off, dmon, dmoff',
  category:    'ai',
  aliases:     ['gpt', 'chat', 'ask'],
  cooldown:    3,
  owner:       false,
  premium:     false,
  group:       null,
};

export async function handler(ctx) {
  const { args, fullArgs, chat: chatJid, sender, pushName, isOwner } = ctx;

  // ── Subcommand dispatch ───────────────────────────────────────────────────

  const sub = args[0]?.toLowerCase();

  // .ai clear / .ai reset
  if (sub === 'clear' || sub === 'reset') {
    const deleted = clearHistory(chatJid);
    return ctx.reply(`🗑️ Cleared *${deleted}* message(s) from AI history for this chat.`);
  }

  // .ai status
  if (sub === 'status') {
    const enabled    = isAIEnabledForChat(chatJid);
    const globalOn   = isAIEnabled();
    const passiveDM  = isPassiveDMEnabled();
    const histCount  = getHistoryCount(chatJid);
    const hasKey     = !!config.groqApiKey;

    return ctx.reply(
      `🤖 *AI Status*\n\n` +
      `• API key:       ${hasKey    ? '✅ configured' : '❌ missing'}\n` +
      `• Global AI:     ${globalOn  ? '✅ enabled'    : '❌ disabled'}\n` +
      `• This chat:     ${enabled   ? '✅ enabled'    : '❌ disabled'}\n` +
      `• Passive DM:    ${passiveDM ? '✅ on'         : '⭕ off'}\n` +
      `• Model:         ${config.groqModel}\n` +
      `• History (chat):${histCount} messages`
    );
  }

  // .ai on / .ai off — owner only
  if (sub === 'on' || sub === 'off') {
    if (!isOwner) return ctx.reply('👑 Only the bot owner can change AI settings.');
    const enable = sub === 'on';
    setAIForChat(chatJid, enable);
    return ctx.reply(enable
      ? '✅ AI chat is now *enabled* for this chat.'
      : '❌ AI chat is now *disabled* for this chat.');
  }

  // .ai dmon / .ai dmoff — owner only
  if (sub === 'dmon' || sub === 'dmoff') {
    if (!isOwner) return ctx.reply('👑 Only the bot owner can toggle passive DM mode.');
    const enable = sub === 'dmon';
    setPassiveDM(enable);
    return ctx.reply(enable
      ? '✅ Passive DM mode *enabled* — I will reply to all DM messages without a prefix.'
      : '⭕ Passive DM mode *disabled* — DMs require the command prefix.');
  }

  // ── Main chat flow ────────────────────────────────────────────────────────

  // Get prompt (everything after ".ai ")
  const prompt = sub === undefined
    ? ''
    : args.join(' ').trim();

  if (!prompt) {
    return ctx.reply(
      `💬 *${config.botName} AI*\n\n` +
      `Send me a message and I'll reply!\n\n` +
      `Subcommands:\n` +
      `  • \`${config.prefix}ai clear\` — clear chat history\n` +
      `  • \`${config.prefix}ai status\` — show AI status\n` +
      `  • \`${config.prefix}ai on/off\` — toggle for this chat (owner)\n` +
      `  • \`${config.prefix}ai dmon/dmoff\` — toggle passive DMs (owner)`
    );
  }

  // Check if AI is enabled for this chat
  if (!isAIEnabledForChat(chatJid)) {
    return ctx.reply('❌ AI chat is currently disabled for this chat.');
  }

  // Rate limit check
  const rl = aiRateLimiter.check(sender, isOwner);
  if (!rl.allowed) {
    return ctx.reply(`⏳ You're sending messages too fast. Please wait *${rl.resetIn}s* before chatting with AI again.`);
  }

  // Typing indicator while we wait for Groq
  try {
    await ctx.sock.sendPresenceUpdate('composing', chatJid);
  } catch { /* best-effort */ }

  let result;
  try {
    result = await chat(chatJid, sender, prompt, {
      senderName: pushName ?? sender,
    });
  } catch (err) {
    // Clear composing state
    try { await ctx.sock.sendPresenceUpdate('paused', chatJid); } catch { /* ok */ }
    return ctx.reply(`⚠️ AI error: ${err.message}`);
  }

  // Clear composing state
  try { await ctx.sock.sendPresenceUpdate('paused', chatJid); } catch { /* ok */ }

  await ctx.reply(result.text);
}
