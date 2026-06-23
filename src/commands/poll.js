/**
 * Command: poll
 * Creates a native WhatsApp poll. Phase 11.
 *
 * Usage:
 *   .poll <question> | option1 | option2 [| option3 ...]
 *   .poll Who is your favourite AI? | Yuzuki | ChatGPT | Gemini
 *
 * Rules:
 *   - 2–12 options required
 *   - Question max 255 chars
 *   - Options max 100 chars each
 *   - Options are trimmed and de-duped
 *
 * Aliases: vote, survey
 */
import { sendPoll, sendInteractive, quickReply } from '../services/rich-messages.js';

export const meta = {
  name:        'poll',
  description: 'Create a native WhatsApp poll — .poll Question | Option A | Option B',
  category:    'utility',
  aliases:     ['vote', 'survey'],
  cooldown:    10,
  owner:       false,
  premium:     false,
  group:       null,
};

const BRAND_FOOTER = '🌸 Yuzuki AI · Powered by cv3inx';

const USAGE_TEXT =
  `📊 *Poll Usage*\n\n` +
  `\`.poll <question> | option1 | option2\`\n\n` +
  `*Example:*\n` +
  `\`.poll Best AI? | Yuzuki | ChatGPT | Gemini\`\n\n` +
  `Rules:\n` +
  `• 2–12 options\n` +
  `• Separate with \`|\`\n` +
  `• Works in DMs and groups`;

export async function handler(ctx) {
  const { body, prefix, sock, chat: jid, rawMessage } = ctx;

  // Strip the command prefix+name to get raw args
  const raw = body.replace(/^[^\s]+\s*/,'').trim();

  if (!raw) {
    return sendInteractive(sock, jid, {
      header:  '📊 Poll Creator',
      body:    USAGE_TEXT,
      footer:  BRAND_FOOTER,
      buttons: [
        quickReply('📋 Help Menu', 'open_menu'),
      ],
    }, rawMessage);
  }

  // Split on pipe — first part is question, rest are options
  const parts   = raw.split('|').map(s => s.trim()).filter(Boolean);
  const question = parts[0];
  const options  = [...new Set(parts.slice(1))]; // de-dupe

  if (!question) {
    return ctx.reply(`❌ Missing question.\n\n${USAGE_TEXT}`);
  }

  if (options.length < 2) {
    return sendInteractive(sock, jid, {
      header:  '❌ Not Enough Options',
      body:    `You need at least *2 options* separated by \`|\`.\n\n${USAGE_TEXT}`,
      footer:  BRAND_FOOTER,
      buttons: [quickReply('📋 Help', 'open_menu')],
    }, rawMessage);
  }

  if (options.length > 12) {
    return ctx.reply(`❌ Too many options — maximum is *12*. You provided ${options.length}.`);
  }

  const tooLong = options.find(o => o.length > 100);
  if (tooLong) {
    return ctx.reply(`❌ Option too long: _"${tooLong.slice(0, 30)}…"_ (max 100 chars per option)`);
  }

  try {
    await sendPoll(sock, jid, question.slice(0, 255), options, {
      selectableCount: 1,
      quoted: rawMessage,
    });
    await ctx.react('📊');
  } catch (e) {
    await ctx.reply(`⚠️ Poll creation failed: ${e.message}`);
  }
}
