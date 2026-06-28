/**
 * Command: pass
 * Secure password generator — generates random, strong passwords locally.
 * No external API required. Supports custom length and character sets.
 *
 * Usage:
 *   .pass              — 16-char strong password (default)
 *   .pass 24           — 24-char password
 *   .pass 12 simple    — 12-char letters+numbers only
 *   .pass pin          — 6-digit numeric PIN
 *   .pass passphrase   — 4-word memorable passphrase
 */
import { sendInteractive, quickReply, ctaCopy } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'pass',
  description: 'Secure password & passphrase generator',
  category:    'tools',
  aliases:     ['password', 'passwd', 'keygen', 'pin'],
  cooldown:    2,
  permission:  'public',
};

const PASS_ICON = { url: 'https://img.icons8.com/color/96/password.png' };

const CHARS = {
  upper:  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower:  'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols:'!@#$%^&*()-_=+[]{}|;:,.<>?',
};

const WORDS = [
  'apple','brave','cloud','dance','eagle','flame','grape','house','ivory','joker',
  'koala','lemon','magic','night','ocean','piano','queen','river','storm','tiger',
  'ultra','vivid','water','xenon','yacht','zebra','alpha','blaze','crisp','delta',
  'ember','frost','glory','honey','ignite','jewel','kite','lunar','maple','noble',
  'opal','pixel','quest','raven','solar','titan','umbra','vault','wolf','xenith',
];

function randomChar(charset) {
  return charset[Math.floor(Math.random() * charset.length)];
}

function generatePassword(length = 16, mode = 'strong') {
  if (mode === 'simple') {
    const pool = CHARS.upper + CHARS.lower + CHARS.digits;
    return Array.from({ length }, () => randomChar(pool)).join('');
  }

  // Strong: guarantee at least 1 of each type, then fill rest randomly
  const pool = CHARS.upper + CHARS.lower + CHARS.digits + CHARS.symbols;
  const required = [
    randomChar(CHARS.upper),
    randomChar(CHARS.lower),
    randomChar(CHARS.digits),
    randomChar(CHARS.symbols),
  ];
  const rest = Array.from({ length: Math.max(0, length - 4) }, () => randomChar(pool));
  const all  = [...required, ...rest];
  // Shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

function generatePin(length = 6) {
  return Array.from({ length }, () => randomChar(CHARS.digits)).join('');
}

function generatePassphrase(wordCount = 4) {
  const words = Array.from({ length: wordCount }, () =>
    WORDS[Math.floor(Math.random() * WORDS.length)]
  );
  const sep   = ['-', '_', '.', ' '][Math.floor(Math.random() * 4)];
  return words.join(sep);
}

function scorePassword(pwd) {
  let score = 0;
  if (pwd.length >= 12) score++;
  if (pwd.length >= 16) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong', 'Excellent'];
  const bars   = ['▱▱▱▱▱', '▰▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰', '▰▰▰▰▰'];
  return { label: labels[Math.min(score, 6)], bar: bars[Math.min(score, 6)] };
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p   = config.prefix;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    return sendInteractive(sock, jid, {
      header:       '🔑 Password Generator',
      contextImage: PASS_ICON,
      body:
        `*Usage:*\n` +
        `• \`${p}pass\` — 16-char strong password\n` +
        `• \`${p}pass 24\` — custom length\n` +
        `• \`${p}pass 12 simple\` — letters & numbers only\n` +
        `• \`${p}pass pin\` — 6-digit PIN\n` +
        `• \`${p}pass passphrase\` — 4-word phrase\n\n` +
        `_Generated locally — never logged or stored_`,
      footer:  `🌸 ${config.botName}`,
      buttons: [quickReply('🔑 Generate Now', 'pass')],
    }, rawMessage);
  }

  if (sub === 'passphrase' || sub === 'phrase') {
    const words = parseInt(args[1], 10);
    const phrase = generatePassphrase(Math.min(Math.max(words || 4, 3), 8));
    return sendInteractive(sock, jid, {
      header:       '🔑 Passphrase',
      contextImage: PASS_ICON,
      body:
        `*Your Passphrase:*\n\`\`\`${phrase}\`\`\`\n\n` +
        `_Tap to copy · ${phrase.split(/[-_. ]/).length} words_\n\n` +
        `⚠️ _Store it safely — it won't be shown again_`,
      footer:  `🌸 ${config.botName} · Generated locally`,
      buttons: [
        quickReply('🔄 New Phrase', 'pass passphrase'),
        quickReply('🔑 Strong Pass', 'pass'),
      ],
    }, rawMessage);
  }

  if (sub === 'pin') {
    const len = parseInt(args[1], 10);
    const pin = generatePin(Math.min(Math.max(len || 6, 4), 10));
    return sendInteractive(sock, jid, {
      header:       '🔢 PIN Generated',
      contextImage: PASS_ICON,
      body:
        `*Your PIN:*\n\`\`\`${pin}\`\`\`\n\n` +
        `_${pin.length}-digit numeric PIN_\n\n` +
        `⚠️ _Store it safely — it won't be shown again_`,
      footer:  `🌸 ${config.botName} · Generated locally`,
      buttons: [
        quickReply('🔄 New PIN', 'pass pin'),
        quickReply('🔑 Strong Pass', 'pass'),
      ],
    }, rawMessage);
  }

  // Default: strong password
  const lengthArg = parseInt(sub, 10);
  const length    = Number.isFinite(lengthArg) ? Math.min(Math.max(lengthArg, 8), 64) : 16;
  const mode      = args.includes('simple') ? 'simple' : 'strong';
  const pwd       = generatePassword(length, mode);
  const strength  = scorePassword(pwd);

  return sendInteractive(sock, jid, {
    header:       '🔑 Password Generated',
    contextImage: PASS_ICON,
    body:
      `*Your Password:*\n\`\`\`${pwd}\`\`\`\n\n` +
      `🔒 *Strength:* ${strength.bar} ${strength.label}\n` +
      `📏 *Length:* ${pwd.length} characters\n\n` +
      `⚠️ _Store it safely — it won't be shown again_`,
    footer:  `🌸 ${config.botName} · Generated locally, never logged`,
    buttons: [
      quickReply('🔄 Regenerate',   `pass ${length}${mode === 'simple' ? ' simple' : ''}`),
      quickReply('🔑 Passphrase',   'pass passphrase'),
      quickReply('🔢 PIN',          'pass pin'),
    ],
  }, rawMessage);
}
