/**
 * Command: translate
 * Text translation via MyMemory API (free, no key, 1000 req/day).
 * Supports 100+ languages. Auto-detects source language.
 *
 * Usage:
 *   .tr Hello world                    — translate to English (default)
 *   .tr id Hello world                 — translate to Indonesian
 *   .tr en|id Hello world              — explicit source|target
 *   .tr list                           — show common language codes
 */
import { sendInteractive, quickReply } from '../services/rich-messages.js';
import { config } from '../config/index.js';

export const meta = {
  name:        'translate',
  description: 'Translate text to any language (auto-detect source)',
  category:    'tools',
  aliases:     ['tr', 'terjemah', 'trans'],
  cooldown:    5,
  permission:  'public',
};

const LANGS = {
  en:'English', id:'Indonesian', ms:'Malay', ar:'Arabic', zh:'Chinese',
  ja:'Japanese', ko:'Korean', es:'Spanish', fr:'French', de:'German',
  pt:'Portuguese', it:'Italian', ru:'Russian', hi:'Hindi', bn:'Bengali',
  ur:'Urdu', tr:'Turkish', nl:'Dutch', pl:'Polish', vi:'Vietnamese',
  th:'Thai', fa:'Persian', uk:'Ukrainian', sv:'Swedish', da:'Danish',
  fi:'Finnish', no:'Norwegian', cs:'Czech', ro:'Romanian', hu:'Hungarian',
};

function parseLangArg(arg) {
  // "en|id" or "en-id" → { from, to }
  const m = arg?.match(/^([a-z]{2})[|:\-]([a-z]{2})$/i);
  if (m) return { from: m[1].toLowerCase(), to: m[2].toLowerCase(), consumed: true };
  // Single lang code like "id" → to lang
  if (/^[a-z]{2}$/i.test(arg ?? '')) return { from: 'autodetect', to: arg.toLowerCase(), consumed: true };
  return { from: 'autodetect', to: 'en', consumed: false };
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  if (!args.length || args[0]?.toLowerCase() === 'list') {
    const list = Object.entries(LANGS).map(([k, v]) => `\`${k}\` ${v}`).join('  ');
    return sendInteractive(sock, jid, {
      header: '🌐 Translate',
      body:
        `*Usage*\n` +
        `• \`${p}tr <text>\` — to English\n` +
        `• \`${p}tr <lang> <text>\` — to language\n` +
        `• \`${p}tr en|id <text>\` — source|target\n\n` +
        `*Language codes:*\n${list}`,
      footer: `🌸 ${config.botName} · MyMemory`,
      buttons: [quickReply('🔄 Try it', `tr id Hello world`)],
    }, rawMessage);
  }

  const { from, to, consumed } = parseLangArg(args[0]);
  const text = (consumed ? args.slice(1) : args).join(' ').trim();

  if (!text) return ctx.reply(`❌ No text to translate. Usage: \`${p}tr ${args[0]} <text>\``);

  try { await ctx.react('🔄'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  const langPair = `${from}|${to}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

  let data;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    data = await r.json();
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ Translation failed: ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  if (data.responseStatus !== 200) {
    return ctx.reply(`❌ Translation error: ${data.responseMessage ?? 'Unknown error'}`);
  }

  const translated = data.responseData.translatedText;
  const detected   = data.responseData.detectedLanguage;
  const fromLabel  = LANGS[from] ?? (detected ? `${detected} (detected)` : from);
  const toLabel    = LANGS[to]   ?? to;

  return sendInteractive(sock, jid, {
    header: `🌐 ${fromLabel} → ${toLabel}`,
    body:
      `*Original:*\n${text}\n\n` +
      `*Translation:*\n${translated}`,
    footer: `🌸 ${config.botName} · MyMemory`,
    buttons: [
      quickReply('🔄 Swap', `tr ${to}|${from} ${translated}`),
      quickReply('📋 New', `tr`),
    ],
  }, rawMessage);
}
