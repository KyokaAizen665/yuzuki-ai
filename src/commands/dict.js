/**
 * Command: dict
 * Dictionary definitions via dictionaryapi.dev (free, no key, English).
 * Shows phonetics, part-of-speech, definitions, and example sentences.
 * Multiple meanings rendered as a sendList for easy browsing.
 *
 * Usage:
 *   .dict serendipity
 *   .dict run
 */
import { sendList, sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'dict',
  description: 'English dictionary — definitions, phonetics, and examples',
  category:    'tools',
  aliases:     ['define', 'definition', 'meaning', 'kamus'],
  cooldown:    5,
  permission:  'public',
};

const DICT_ICON = { url: 'https://img.icons8.com/color/96/book.png' };

function posEmoji(pos) {
  const map = {
    noun:'📦', verb:'⚡', adjective:'🎨', adverb:'🔀',
    pronoun:'👤', preposition:'📍', conjunction:'🔗',
    interjection:'💬', article:'📰',
  };
  return map[pos?.toLowerCase()] ?? '📝';
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p    = config.prefix;
  const word = args.join(' ').trim().toLowerCase();

  if (!word) {
    return sendInteractive(sock, jid, {
      header:       '📚 Dictionary',
      contextImage: DICT_ICON,
      body:
        `*Usage:* \`${p}dict <word>\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}dict serendipity\`\n` +
        `• \`${p}dict ephemeral\`\n` +
        `• \`${p}dict run\``,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('📖 Try: serendipity', 'dict serendipity')],
    }, rawMessage);
  }

  try { await ctx.react('📚'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  let data;
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 404) throw new Error(`"${word}" not found in dictionary.`);
    if (!r.ok)            throw new Error(`API error: HTTP ${r.status}`);
    data = await r.json();
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const entry    = data[0];
  const phonetic = entry.phonetic
    ?? entry.phonetics?.find(p => p.text)?.text
    ?? '';

  // Flatten all meanings
  const allDefs = [];
  for (const meaning of entry.meanings ?? []) {
    for (const def of meaning.definitions ?? []) {
      allDefs.push({
        pos:     meaning.partOfSpeech,
        text:    def.definition,
        example: def.example ?? null,
      });
    }
  }

  if (!allDefs.length) return ctx.reply(`❌ No definitions found for "${word}".`);

  // Show first 3 in interactive card, rest in list
  const first    = allDefs.slice(0, 3);
  const bodyText =
    `📖 *${entry.word}* ${phonetic ? `_${phonetic}_` : ''}\n\n` +
    first.map((d, i) =>
      `${i + 1}. ${posEmoji(d.pos)} _${d.pos}_\n` +
      `   ${d.text}` +
      (d.example ? `\n   _"${d.example}"_` : '')
    ).join('\n\n');

  // Build list sections for all parts of speech
  const sections = [];
  for (const meaning of entry.meanings ?? []) {
    const rows = meaning.definitions.slice(0, 6).map((def, i) => ({
      id:          `def_${meaning.partOfSpeech}_${i}`,
      title:       def.definition.slice(0, 72),
      description: def.example ? `"${def.example.slice(0, 72)}"` : '',
    }));
    if (rows.length) sections.push({ title: `${posEmoji(meaning.partOfSpeech)} ${meaning.partOfSpeech}`, rows });
  }

  if (sections.length > 1) {
    try {
      await sendList(sock, jid, {
        title:       `📖 ${entry.word}${phonetic ? ` ${phonetic}` : ''}`,
        description: bodyText.slice(0, 300),
        buttonText:  'All Definitions',
        footer:      `🌸 ${config.botName} · dictionaryapi.dev`,
        sections,
      }, rawMessage);
      return;
    } catch { /* fallback to interactive */ }
  }

  return sendInteractive(sock, jid, {
    header:       `📖 ${entry.word}`,
    contextImage: DICT_ICON,
    body:         bodyText.slice(0, 900),
    footer:       `🌸 ${config.botName} · dictionaryapi.dev`,
    buttons: [
      quickReply('🔄 Another Word', 'dict'),
      quickReply('🎲 Random Word',  'dict serendipity'),
    ],
  }, rawMessage);
}
