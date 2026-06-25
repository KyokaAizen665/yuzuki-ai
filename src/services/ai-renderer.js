/**
 * AI Response Renderer — Phase 8
 *
 * THE single approved output path for all AI command responses in Yuzuki AI.
 *
 * Usage:
 *   import { renderAIResponse } from '../services/ai-renderer.js';
 *   await renderAIResponse(ctx, { provider, model, response, latency, usage });
 *
 * Payload shape:
 *   {
 *     provider,          // string  — e.g. "gemini", "groq", "openrouter"
 *     model,             // string  — model identifier
 *     prompt,            // string  — original user text (informational)
 *     response,          // string  — AI response text  ← REQUIRED
 *     latency,           // number  — ms elapsed (optional)
 *     usage,             // { tokens: number } (optional)
 *     suggestedPrompts,  // string[] — follow-up button labels (override)
 *     withHero,          // boolean — include hero image at Level 2 (default: false)
 *   }
 *
 * Render chain (cv3inx-first, degrades gracefully):
 *
 *   Level 1 — sendNativeAIResponse
 *             cv3inx AIRichResponseMessage proto path.
 *             Falls back internally to sendAIRichResponse when proto utils
 *             are unavailable (handled inside rich-messages.js).
 *             If the entire Level 1 call throws, Level 2 takes over.
 *
 *   Level 2 — sendInteractive / sendInteractiveWithImage
 *             NativeFlow interactive message with header, body, footer,
 *             and up to 3 quick-reply buttons.
 *             withHero: true adds a hero image card header.
 *
 *   Level 3 — Formatted text
 *             sock.sendMessage({ text }) with WA markdown.
 *             The AI response is NEVER lost.
 *
 *   Last resort — raw plain text (should be unreachable in practice)
 *
 * Logging:
 *   [AI_RENDER] provider=gemini model=gemini-2.0-flash-lite renderer=nativeflow status=success
 *   [AI_RENDER] provider=groq   model=llama-3.3-70b         renderer=interactive status=success
 *   [AI_RENDER] provider=openrouter                         renderer=fallback     status=success
 *
 * Future compatibility:
 *   Adding a new AI provider never requires changes to this file.
 *   All provider-specific logic lives in services/ai/providers/*.js.
 */

import { log }              from '../utils/logger.js';
import { getRandomHeroImage } from './hero-images.js';
import {
  parseAIText,
  sendNativeAIResponse,
  sendInteractive,
  quickReply,
}                           from './rich-messages.js';
import { config }           from '../config/index.js';

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Lazily reads botName so it reflects any runtime override. */
const botLabel = () => config.botName ?? 'Yuzuki AI';

/**
 * buildFooter(provider, model, latency, tokens) → string
 *
 * Compact attribution line for the message footer.
 * Example: "gemini · gemini-2.0-flash-lite · 342ms · 128 tok"
 */
function buildFooter(provider, model, latency, tokens) {
  const parts = [];
  if (provider)        parts.push(provider);
  if (model)           parts.push(model);
  if (latency != null) parts.push(`${latency}ms`);
  if (tokens)          parts.push(`${tokens} tok`);
  return parts.join(' · ') || `🌸 ${botLabel()}`;
}

/**
 * buildSuggestedPrompts(parsed, override?) → string[]
 *
 * Selects context-appropriate follow-up prompts.
 * Caller may pass an explicit override (e.g. task subcommand follow-ups).
 */
function buildSuggestedPrompts(parsed, override) {
  if (Array.isArray(override) && override.length) return override;
  return parsed.codeBlocks.length
    ? ['Explain this code', 'Improve it', 'Add comments']
    : ['Continue', 'Explain more', 'Simplify'];
}

/**
 * _log(provider, model, renderer, status) → void
 *
 * Emits a structured [AI_RENDER] log line for observability.
 */
function _log(provider, model, renderer, status) {
  log.info(
    `[AI_RENDER] provider=${provider ?? 'unknown'} ` +
    `model=${model ?? 'unknown'} ` +
    `renderer=${renderer} ` +
    `status=${status}`
  );
}

// ── Render levels ──────────────────────────────────────────────────────────────

/**
 * _tryNative — Level 1
 *
 * cv3inx AIRichResponseMessage proto path via sendNativeAIResponse.
 * Internally degrades to sendAIRichResponse when proto utils are absent.
 * Throws if both internal paths fail (handled by the caller).
 */
async function _tryNative(sock, jid, parsed, opts, quoted) {
  await sendNativeAIResponse(sock, jid, {
    text:             parsed.text,
    codeBlocks:       parsed.codeBlocks,
    tables:           parsed.tables ?? [],
    suggestedPrompts: opts.suggestedPrompts,
    model:            opts.model,
    provider:         opts.provider,
    tokens:           opts.tokens,
  }, quoted);
}

/**
 * _tryInteractive — Level 2
 *
 * NativeFlow interactive message with up to 3 quick-reply buttons.
 * withHero: true adds an AI hero image card header via sendInteractiveWithImage.
 */
async function _tryInteractive(sock, jid, parsed, opts, quoted, withHero) {
  const footer = buildFooter(opts.provider, opts.model, opts.latency, opts.tokens);
  const btns   = opts.suggestedPrompts.slice(0, 3).map((p, i) =>
    quickReply(p.slice(0, 20), `ai_suggest_${i}`)
  );

  // Build body: main text + inline code blocks
  let body = parsed.text;
  for (const cb of (parsed.codeBlocks ?? [])) {
    const snippet = cb.code.length > 280 ? cb.code.slice(0, 280) + '…' : cb.code;
    body += `\n\n*${cb.language ?? 'code'}*\n\`\`\`${snippet}\`\`\``;
  }
  body = body.slice(0, 1024);

  const header = `🤖 ${botLabel()}`;

  if (withHero) {
    await sendInteractive(sock, jid, {
      header,
      contextImage: getRandomHeroImage('ai'),
      body,
      footer,
      buttons: btns,
    }, quoted);
  } else {
    await sendInteractive(sock, jid, {
      header,
      body,
      footer,
      buttons: btns,
    }, quoted);
  }
}

/**
 * _fallbackText — Level 3
 *
 * WhatsApp-markdown formatted text via sock.sendMessage.
 * The AI response is NEVER lost.
 */
async function _fallbackText(sock, jid, parsed, opts, quoted) {
  const meta = buildFooter(opts.provider, opts.model, opts.latency, opts.tokens);
  let body = parsed.text;
  for (const cb of (parsed.codeBlocks ?? [])) {
    body += `\n\n*${cb.language ?? 'code'}*\n\`\`\`${cb.code}\`\`\``;
  }
  const text = `${body}\n\n_${meta}_`;
  await sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * renderAIResponse(ctx, payload) → Promise<void>
 *
 * THE single approved output path for all AI command responses.
 * All AI commands must call this instead of sending output directly.
 *
 * @param {object}  ctx                       — Yuzuki command context
 * @param {object}  payload                   — AI result payload
 * @param {string}  payload.provider          — provider name (e.g. "gemini")
 * @param {string}  [payload.model]           — model identifier
 * @param {string}  [payload.prompt]          — original user prompt (informational)
 * @param {string}  payload.response          — AI response text  ← REQUIRED
 * @param {number}  [payload.latency]         — elapsed ms
 * @param {object}  [payload.usage]           — { tokens: number }
 * @param {string[]}[payload.suggestedPrompts]— follow-up button labels (override)
 * @param {boolean} [payload.withHero]        — hero image at Level 2 (default: false)
 */
export async function renderAIResponse(ctx, payload) {
  const {
    provider,
    model,
    response,
    latency,
    usage,
    withHero = false,
  } = payload;

  const { sock, chat: jid, rawMessage } = ctx;
  const tokens = usage?.tokens ?? 0;

  if (!response) {
    log.warn('[AI_RENDER] renderAIResponse called with empty response — skipping');
    return;
  }

  // Parse: extract code blocks and markdown tables from raw AI text
  const parsed           = parseAIText(response);
  const suggestedPrompts = buildSuggestedPrompts(parsed, payload.suggestedPrompts);
  const opts             = { provider, model, latency, tokens, suggestedPrompts };

  // ── Level 1: Native cv3inx AI Rich Response ────────────────────────────────
  try {
    await _tryNative(sock, jid, parsed, opts, rawMessage);
    _log(provider, model, 'nativeflow', 'success');
    return;
  } catch (e) {
    log.debug(`[AI_RENDER] nativeflow path failed (${e.message}) — trying interactive`);
  }

  // ── Level 2: NativeFlow interactive message ────────────────────────────────
  try {
    await _tryInteractive(sock, jid, parsed, opts, rawMessage, withHero);
    _log(provider, model, 'interactive', 'success');
    return;
  } catch (e) {
    log.debug(`[AI_RENDER] interactive path failed (${e.message}) — text fallback`);
  }

  // ── Level 3: Formatted text (response is NEVER lost) ──────────────────────
  try {
    await _fallbackText(sock, jid, parsed, opts, rawMessage);
    _log(provider, model, 'fallback', 'success');
    return;
  } catch (e) {
    log.error(`[AI_RENDER] All render paths failed: ${e.message}`);
  }

  // ── Last resort: raw plain text (truly unreachable in normal operation) ────
  try {
    await sock.sendMessage(jid, { text: response });
  } catch { /* cannot do anything more */ }
  _log(provider, model, 'plaintext', 'last-resort');
}