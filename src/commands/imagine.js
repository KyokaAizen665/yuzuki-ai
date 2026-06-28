/**
 * Command: imagine
 * AI image generation via Pollinations.ai (free, no key, no sign-up).
 *
 * Available models:
 *   flux (default) | flux-schnell | flux-realism | flux-anime | flux-3d | any-dark | turbo
 *
 * Usage:
 *   .imagine a cat in a spacesuit
 *   .imagine cyberpunk city --anime
 *   .imagine portrait of a samurai --dark
 *   .imagine styles              — show model list
 */
import { sendInteractive, quickReply, ctaCopy } from '../services/rich-messages.js';
import { config }                               from '../config/index.js';
import { log }                                  from '../utils/logger.js';

export const meta = {
  name:        'imagine',
  description: 'Generate AI images from text prompts (Pollinations, free)',
  category:    'generator',
  aliases:     ['gen', 'ai-img', 'aiimg', 'draw', 'paint'],
  cooldown:    15,
  permission:  'public',
};

const IMG_ICON = { url: 'https://img.icons8.com/color/96/image--v1.png' };

const MODELS = {
  flux:          { label: '✨ Flux',         param: 'flux'          },
  schnell:       { label: '⚡ Schnell',       param: 'flux-schnell'  },
  realism:       { label: '📸 Realism',       param: 'flux-realism'  },
  anime:         { label: '🎌 Anime',         param: 'flux-anime'    },
  '3d':          { label: '🎲 3D',            param: 'flux-3d'       },
  dark:          { label: '🌑 Dark',          param: 'any-dark'      },
  turbo:         { label: '🚀 Turbo',         param: 'turbo'         },
};

function pickModel(args) {
  for (const [key, m] of Object.entries(MODELS)) {
    const flag = `--${key}`;
    const idx  = args.indexOf(flag);
    if (idx !== -1) {
      const cleaned = [...args];
      cleaned.splice(idx, 1);
      return { model: m, prompt: cleaned.join(' ').trim() };
    }
  }
  return { model: MODELS.flux, prompt: args.join(' ').trim() };
}

async function fetchImage(prompt, modelParam, seed) {
  const encoded = encodeURIComponent(prompt);
  const url     =
    `https://image.pollinations.ai/prompt/${encoded}` +
    `?model=${modelParam}&width=1024&height=1024&nologo=true&enhance=true&seed=${seed}`;

  const r = await fetch(url, {
    headers: { 'User-Agent': 'Yuzuki-AI/2.0' },
    signal:  AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`Pollinations returned HTTP ${r.status}`);
  const ab  = await r.arrayBuffer();
  return Buffer.from(ab);
}

export async function handler(ctx) {
  const { sock, chat: jid, args, rawMessage } = ctx;
  const p = config.prefix;

  if (!args.length || args[0]?.toLowerCase() === 'styles') {
    const modelList = Object.entries(MODELS)
      .map(([k, m]) => `• \`--${k}\`  ${m.label}`)
      .join('\n');

    return sendInteractive(sock, jid, {
      header:       '🎨 AI Image Generator',
      contextImage: IMG_ICON,
      body:
        `*Usage:* \`${p}imagine <prompt> [--style]\`\n\n` +
        `*Examples:*\n` +
        `• \`${p}imagine a cat in a spacesuit\`\n` +
        `• \`${p}imagine samurai warrior --anime\`\n` +
        `• \`${p}imagine cyberpunk city --dark\`\n\n` +
        `*Style flags:*\n${modelList}`,
      footer:  `🌸 ${config.botName} · Pollinations.ai`,
      buttons: [quickReply('🎨 Try it', 'imagine a beautiful sunset')],
    }, rawMessage);
  }

  const { model, prompt } = pickModel(args);
  if (!prompt) return ctx.reply(`❌ Empty prompt. Usage: \`${p}imagine <description>\``);

  try { await ctx.react('🎨'); } catch {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}

  const seed = Math.floor(Math.random() * 999999);
  log.info(`[imagine] "${prompt}" model=${model.param} seed=${seed}`);

  let buffer;
  try {
    buffer = await fetchImage(prompt, model.param, seed);
  } catch (e) {
    try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    return ctx.reply(`❌ Image generation failed: ${e.message}`);
  }
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}

  const caption =
    `🎨 *${model.label}*\n` +
    `_"${prompt.length > 80 ? prompt.slice(0, 80) + '…' : prompt}"_\n\n` +
    `🌸 ${config.botName} · Pollinations.ai`;

  try {
    await sock.sendMessage(jid, {
      image:    buffer,
      caption,
      mimetype: 'image/jpeg',
      nativeFlow: [
        quickReply('🔄 Regenerate',    `imagine ${prompt} --${Object.entries(MODELS).find(([,m])=>m===model)?.[0]??'flux'}`),
        quickReply('🎌 Anime style',   `imagine ${prompt} --anime`),
        quickReply('🌑 Dark style',    `imagine ${prompt} --dark`),
        quickReply('📸 Realistic',     `imagine ${prompt} --realism`),
      ],
    }, { quoted: rawMessage });
    try { await ctx.react('✅'); } catch {}
  } catch (e) {
    return ctx.reply(`❌ Failed to send image: ${e.message}`);
  }
}
