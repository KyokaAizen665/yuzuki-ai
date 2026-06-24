/**
 * Command: memory
 *
 * Manage the AI's long-term memory about you or this chat.
 *
 * Usage:
 *   .memory                  — show your stored memories
 *   .memory set <key> <val>  — store a fact about yourself
 *   .memory forget <key>     — delete one memory by key
 *   .memory clear            — clear all your memories
 *   .memory chat             — show memories for this chat (owner)
 *   .memory global set <k> <v> — store a global fact (owner only)
 *   .memory global clear       — clear global memory (owner only)
 *
 * Aliases: mem, remember
 */
import {
  remember,
  recall,
  forget,
  getMemoryCount,
} from '../services/ai/MemoryManager.js';

export const meta = {
  name:        'memory',
  description: 'Manage AI long-term memory — what the bot remembers about you',
  category:    'ai',
  aliases:     ['mem', 'remember'],
  cooldown:    3,
  permission:  'public',
};

export async function handler(ctx) {
  const { args, sender, chat: chatJid, isOwner } = ctx;
  const sub = args[0]?.toLowerCase();

  // ── .memory (no args) — show user memories ────────────────────────────────
  if (!sub) {
    const mems  = recall('user', sender, 20);
    const count = getMemoryCount('user', sender);

    if (!mems.length) {
      return ctx.reply(
        `🧠 *Memory*\n\nI don't have any memories about you yet.\n\n` +
        `Use \`.memory set <key> <value>\` to teach me something.\n` +
        `_Example: \`.memory set name John\`_`
      );
    }

    const lines = [`🧠 *Your Memories* (${count}):\n`];
    for (const m of mems) {
      lines.push(`• *${m.key}*: ${m.value}`);
    }
    lines.push(`\nUse \`.memory forget <key>\` to remove one.`);
    return ctx.reply(lines.join('\n'));
  }

  // ── .memory set <key> <value> ─────────────────────────────────────────────
  if (sub === 'set') {
    const key = args[1];
    const val = args.slice(2).join(' ').trim();

    if (!key || !val) {
      return ctx.reply(
        `📝 *Usage:* \`.memory set <key> <value>\`\n` +
        `_Example:_ \`.memory set name John\`\n` +
        `_Example:_ \`.memory set language Spanish\``
      );
    }

    remember('user', sender, key, val);
    return ctx.reply(`✅ Remembered: *${key}* = _${val}_`);
  }

  // ── .memory forget <key> ─────────────────────────────────────────────────
  if (sub === 'forget') {
    const key = args[1];
    if (!key) return ctx.reply('❌ Specify a key to forget. Use `.memory` to see your stored keys.');

    forget('user', sender, key);
    return ctx.reply(`🗑️ Forgot *${key}*.`);
  }

  // ── .memory clear ─────────────────────────────────────────────────────────
  if (sub === 'clear') {
    forget('user', sender);
    return ctx.reply('🗑️ All your memories have been cleared.');
  }

  // ── .memory chat — show chat memories (owner) ─────────────────────────────
  if (sub === 'chat') {
    if (!isOwner) return ctx.reply('👑 Chat memory management is restricted to the bot owner.');
    const mems = recall('chat', chatJid, 20);
    if (!mems.length) return ctx.reply('🧠 No memories stored for this chat yet.');

    const lines = [`🧠 *Chat Memories* (${chatJid.split('@')[0]}):\n`];
    for (const m of mems) lines.push(`• *${m.key}*: ${m.value}`);
    return ctx.reply(lines.join('\n'));
  }

  // ── .memory global <set|clear> — global memory (owner only) ──────────────
  if (sub === 'global') {
    if (!isOwner) return ctx.reply('👑 Global memory management is restricted to the bot owner.');

    const gsub = args[1]?.toLowerCase();

    if (gsub === 'set') {
      const key = args[2];
      const val = args.slice(3).join(' ').trim();
      if (!key || !val) return ctx.reply('📝 Usage: `.memory global set <key> <value>`');
      remember('global', null, key, val);
      return ctx.reply(`✅ Global memory set: *${key}* = _${val}_`);
    }

    if (gsub === 'clear') {
      forget('global', null);
      return ctx.reply('🗑️ Global memory cleared.');
    }

    // Show global memories
    const mems = recall('global', null, 20);
    if (!mems.length) return ctx.reply('🧠 No global memories set yet.');
    const lines = [`🧠 *Global Memories*:\n`];
    for (const m of mems) lines.push(`• *${m.key}*: ${m.value}`);
    return ctx.reply(lines.join('\n'));
  }

  // ── Unknown subcommand ────────────────────────────────────────────────────
  return ctx.reply(
    `🧠 *Memory Commands*\n\n` +
    `• \`.memory\` — show your memories\n` +
    `• \`.memory set <key> <val>\` — store a fact\n` +
    `• \`.memory forget <key>\` — delete a fact\n` +
    `• \`.memory clear\` — clear all your memories\n` +
    `• \`.memory chat\` — show chat memories (owner)\n` +
    `• \`.memory global set <k> <v>\` — global fact (owner)\n` +
    `• \`.memory global clear\` — clear global (owner)`
  );
}
