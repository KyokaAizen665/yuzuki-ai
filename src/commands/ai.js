/**
 * Command: ai — Phase 8 upgrade
 *
 * PATCH CHANGES vs Phase 3:
 *   • All final AI output now routes through renderAIResponse() — the single
 *     approved output path. No direct sendNativeAIResponse / m.reply() calls
 *     for AI response content.
 *   • Latency is tracked at the command level and passed to the renderer so
 *     every response card shows real round-trip time.
 *   • Task subcommands use task-specific suggestedPrompts passed into renderer.
 *   • All other subcommands (clear, status, provider, personality, on/off,
 *     dmon/dmoff) are unchanged.
 *
 * Usage:
 *   .ai <message>                — chat
 *   .ai clear                    — clear history
 *   .ai status                   — provider info
 *   .ai provider [name]          — list / switch providers
 *   .ai on / .ai off             — enable/disable in this chat (owner)
 *   .ai dmon / .ai dmoff         — passive DM toggle (owner)
 *   .ai personality [key]        — list / set personality (owner)
 *   .ai summarise <text>         — summarise content
 *   .ai translate <lang> <text>  — translate text
 *   .ai explain <text>           — explain in simple terms
 *   .ai debug <code>             — debug code
 *   .ai brainstorm <topic>       — generate ideas
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
import { getPersonalities, buildTaskPrompt } from '../services/ai/PromptManager.js';
import {
  sendInteractive,
  sendReaction,
  quickReply,
}                           from '../services/rich-messages.js';
import { getRandomHeroImage } from '../services/hero-images.js';
import { renderAIResponse } from '../services/ai-renderer.js';

export const meta = {
  name:        'ai',
  description: 'Chat with the AI. Subcommands: clear, status, provider, personality, on, off, dmon, dmoff, summarise, translate, explain, debug, brainstorm',
  category:    'ai',
  aliases:     ['gpt', 'chat', 'ask'],
  cooldown:    3,
  permission:  'public',
};

// ── Task subcommands ──────────────────────────────────────────────────────────

const TASK_SUBS = new Set(['summarise', 'translate', 'explain', 'debug', 'brainstorm']);

/**
 * handleTask(ctx, task, textArgs) → Promise<void>
 *
 * One-shot task call (skipHistory: true). Routes output through renderAIResponse.
 */
async function handleTask(ctx, task, textArgs) {
  const { chat: chatJid, sender, pushName, isOwner } = ctx;

  if (!isAIEnabledForChat(chatJid)) {
    return ctx.reply('❌ AI chat is currently disabled for this chat.');
  }

  // Special handling for translate: first arg is the target language
  let userText;
  let taskContext = {};
  if (task === 'translate') {
    const [lang, ...rest] = textArgs;
    if (!lang || !rest.length) {
      return ctx.reply(
        `🌐 *Usage:* \`.ai translate <language> <text>\`\n` +
        `_Example:_ \`.ai translate French Hello, how are you?\``
      );
    }
    taskContext.language = lang;
    userText = rest.join(' ');
  } else {
    userText = textArgs.join(' ');
    if (!userText.trim()) {
      const usage = {
        summarise:  `\`.ai summarise <text to summarise>\``,
        explain:    `\`.ai explain <topic or concept>\``,
        debug:      `\`.ai debug <code or error>\``,
        brainstorm: `\`.ai brainstorm <topic>\``,
      }[task] ?? `\`.ai ${task} <text>\``;
      return ctx.reply(`📝 *Usage:* ${usage}`);
    }
  }

  const rl = aiRateLimiter.check(sender, isOwner);
  if (!rl.allowed) {
    return ctx.reply(`⏳ Too fast — please wait *${rl.resetIn}s* before sending again.`);
  }

  // Signal receipt
  try { await sendReaction(ctx.sock, chatJid, ctx.key, '⚙️'); } catch { /* best-effort */ }
  try { await ctx.sock.sendPresenceUpdate('composing', chatJid); } catch { /* best-effort */ }

  // Build a task-augmented prompt
  const taskInstruction = buildTaskPrompt(task, taskContext);
  const fullPrompt = taskInstruction ? `${taskInstruction}\n\n${userText}` : userText;

  const startMs = Date.now();
  let result;
  try {
    result = await chat(chatJid, sender, fullPrompt, {
      senderName:  pushName ?? sender,
      skipHistory: true,
    });
  } catch (err) {
    try { await ctx.sock.sendPresenceUpdate('paused', chatJid); } catch {}
    try { await sendReaction(ctx.sock, chatJid, ctx.key, '❌'); } catch {}
    return ctx.reply(`⚠️ AI error: ${err.message}`);
  }
  const latency = Date.now() - startMs;

  try { await ctx.sock.sendPresenceUpdate('paused', chatJid); } catch {}

  // Task-specific follow-up prompts
  const suggestedPrompts = {
    summarise:  ['Expand on this', 'Bullet points only', 'One sentence'],
    translate:  ['Translate to Spanish', 'Translate to French', 'Translate to Arabic'],
    explain:    ['Give an example', 'Explain simpler', 'More detail'],
    debug:      ['Explain the fix', 'Show full corrected code', 'Add tests'],
    brainstorm: ['More ideas', 'Develop idea 1', 'Rank by feasibility'],
  }[task] ?? ['Continue', 'Explain more', 'Give example'];

  // Determine success reaction from raw result
  const hasCode = result.text?.includes('```');
  try { await sendReaction(ctx.sock, chatJid, ctx.key, hasCode ? '💻' : '✅'); } catch {}

  await renderAIResponse(ctx, {
    provider:        result.provider,
    model:           result.model,
    prompt:          fullPrompt,
    response:        result.text,
    latency,
    usage:           { tokens: result.tokens ?? 0 },
    suggestedPrompts,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler(ctx) {
  const { args, chat: chatJid, sender, pushName, isOwner } = ctx;

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
      `🤖 *AI Status — Phase 8*\n\n` +
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
      const lines = personalities.map(p => `• *${p.key}* — ${p.displayName}`);
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

  // ── .ai on / .ai off ──────────────────────────────────────────────────────
  if (sub === 'on' || sub === 'off') {
    if (!isOwner) return ctx.reply('👑 Only the bot owner can change AI settings.');
    setAIForChat(chatJid, sub === 'on');
    return ctx.reply(sub === 'on'
      ? '✅ AI chat is now *enabled* for this chat.'
      : '❌ AI chat is now *disabled* for this chat.');
  }

  // ── .ai dmon / .ai dmoff ──────────────────────────────────────────────────
  if (sub === 'dmon' || sub === 'dmoff') {
    if (!isOwner) return ctx.reply('👑 Only the bot owner can toggle passive DM mode.');
    setPassiveDM(sub === 'dmon');
    return ctx.reply(sub === 'dmon'
      ? '✅ Passive DM mode *enabled* — I will reply to all DMs without a prefix.'
      : '⭕ Passive DM mode *disabled* — DMs require the command prefix.');
  }

  // ── Task subcommands ──────────────────────────────────────────────────────
  if (TASK_SUBS.has(sub)) {
    return handleTask(ctx, sub, args.slice(1));
  }

  // ── No-args: show info card ───────────────────────────────────────────────
  const prompt = args.join(' ').trim();

  if (!prompt) {
    const active = AIManager.getActiveProvider();
    const p = config.prefix;
    return sendInteractive(ctx.sock, chatJid, {
      header:       `🤖 ${config.botName} AI`,
      contextImage: getRandomHeroImage('ai'),
      body:
        `◆ ᴩʀᴏᴠɪᴅᴇʀ  *${active ?? 'none'}*\n\n` +
        `▸ \`${p}ai <message>\`\n\n` +
        `\`${p}ai summarise <text>\`\n` +
        `\`${p}ai translate French <text>\`\n` +
        `\`${p}ai debug <code>\``,
      footer:  `🌸 ${config.botName ?? 'Yuzuki AI'}`,
      buttons: [
        quickReply('🧹 Clear History', 'ai_clear'),
        quickReply('📊 AI Status',     'ai_status'),
        quickReply('🎭 Personalities', 'ai_personality'),
      ],
    }, ctx.rawMessage);
  }

  // ── Main chat flow ─────────────────────────────────────────────────────────

  if (!isAIEnabledForChat(chatJid)) {
    return ctx.reply('❌ AI chat is currently disabled for this chat.');
  }

  const rl = aiRateLimiter.check(sender, isOwner);
  if (!rl.allowed) {
    return ctx.reply(`⏳ Too fast — please wait *${rl.resetIn}s* before chatting again.`);
  }

  try { await sendReaction(ctx.sock, chatJid, ctx.key, '✨'); } catch { /* best-effort */ }
  try { await ctx.sock.sendPresenceUpdate('composing', chatJid); } catch { /* best-effort */ }

  const startMs = Date.now();
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
  const latency = Date.now() - startMs;

  try { await ctx.sock.sendPresenceUpdate('paused', chatJid); } catch {}

  const hasCode = result.text?.includes('```');
  try { await sendReaction(ctx.sock, chatJid, ctx.key, hasCode ? '💻' : '✅'); } catch {}

  await renderAIResponse(ctx, {
    provider:  result.provider,
    model:     result.model,
    prompt,
    response:  result.text,
    latency,
    usage:     { tokens: result.tokens ?? 0 },
  });
}