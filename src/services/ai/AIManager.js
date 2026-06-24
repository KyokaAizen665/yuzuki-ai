/**
 * AIManager — Phase 7
 *
 * Unified AI provider abstraction with auto-detection, priority ordering,
 * and automatic fallback chain.
 *
 * Provider priority (configurable via AI_PROVIDER / AI_FALLBACK_CHAIN env):
 *   1. Groq          — fast, free tier, needs GROQ_API_KEY
 *   2. Gemini        — free tier, needs GEMINI_API_KEY
 *   3. OpenRouter    — free models, needs OPENROUTER_API_KEY
 *   4. OpenAI        — needs OPENAI_API_KEY
 *   5. Puter         — free credits, needs PUTER_API_KEY
 *   6. Pollinations  — zero-key, always available (last resort)
 *
 * ── Command-facing API (Phase 7) ─────────────────────────────────────────────
 *
 *   generate({ prompt, provider?, model?, maxTokens?, temperature? })
 *     → { success: true,  provider, text, usage: { tokens } }
 *     → { success: false, error: string }
 *
 *   All AI commands must use this form. It handles provider selection,
 *   fallback, latency logging, and error normalisation automatically.
 *
 * ── Lower-level APIs (internal / compat) ─────────────────────────────────────
 *
 *   chat(chatJid, senderJid, text, opts?)   — full conversation turn
 *   getAvailableProviders()                 — provider meta[]
 *   getActiveProvider()                     → provider name
 *   setProvider(name)                       → boolean
 *   status()                               → diagnostic object
 */
import { log } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { getSetting, setSetting } from '../../database/store.js';
import { buildSystemPrompt } from './PromptManager.js';
import { getHistory, addTurn, isSessionStale, clearHistory as clearConvHistory } from './ConversationManager.js';
import { recallForPrompt } from './MemoryManager.js';

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDER_MODULES = [
  () => import('./providers/gemini.js'),
  () => import('./providers/groq.js'),
  () => import('./providers/openrouter.js'),
  () => import('./providers/openai.js'),
  () => import('./providers/puter.js'),
  () => import('./providers/pollinations.js'),
];

const PROVIDER_NAMES = ['gemini', 'groq', 'openrouter', 'openai', 'puter', 'pollinations'];

// ── State ─────────────────────────────────────────────────────────────────────

/** Map<name, { meta, generate, isAvailable }> */
let _providers = new Map();
/** Ordered list of available provider names */
let _chain = [];
/** Currently preferred provider (null = use chain order) */
let _preferred = null;
/** Cleanup interval */
let _cleanupTimer = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * init() — load all providers and build the availability chain.
 * Call once at startup. Safe to call multiple times (idempotent).
 */
export async function init() {
  _providers.clear();
  _chain = [];

  for (const loader of PROVIDER_MODULES) {
    try {
      const mod = await loader();
      const available = await mod.isAvailable();
      _providers.set(mod.meta.name, mod);

      if (available) {
        _chain.push(mod.meta.name);
        log.plugin(`[ai:manager] Provider ready: ${mod.meta.displayName}${mod.meta.requiresKey ? '' : ' (no key needed)'}`);
      } else {
        log.debug(`[ai:manager] Provider skipped (no key): ${mod.meta.displayName}`);
      }
    } catch (e) {
      log.error(`[ai:manager] Failed to load provider: ${e.message}`);
    }
  }

  // Apply user-configured ordering / preference
  const preferred = config.aiProvider && config.aiProvider !== 'auto'
    ? config.aiProvider
    : getSetting('ai_provider');

  if (preferred && _chain.includes(preferred)) {
    _preferred = preferred;
  }

  // Apply custom fallback chain order if configured
  const chainEnv = config.aiFallbackChain;
  if (chainEnv) {
    const ordered = chainEnv
      .split(',')
      .map(s => s.trim())
      .filter(n => _chain.includes(n));
    const rest = _chain.filter(n => !ordered.includes(n));
    _chain = [...ordered, ...rest];
  }

  if (_chain.length === 0) {
    log.warn('[ai:manager] No AI providers available — all commands will fail gracefully');
  } else {
    log.startup(`[ai:manager] Chain: ${_chain.join(' → ')}`);
  }

  // Schedule memory cleanup every hour
  if (_cleanupTimer) clearInterval(_cleanupTimer);
  _cleanupTimer = setInterval(async () => {
    try {
      const { cleanup } = await import('./MemoryManager.js');
      cleanup();
    } catch { /* non-critical */ }
  }, 60 * 60_000);
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}

// ── Provider switching ────────────────────────────────────────────────────────

/** setProvider(name) — pin a specific provider. Returns false if unavailable. */
export function setProvider(name) {
  if (!_chain.includes(name)) return false;
  _preferred = name;
  setSetting('ai_provider', name);
  log.info(`[ai:manager] Pinned provider → ${name}`);
  return true;
}

/** clearProvider() — remove pin, use chain order again. */
export function clearProvider() {
  _preferred = null;
  setSetting('ai_provider', '');
}

// ── Internal: raw generate with fallback ──────────────────────────────────────

/**
 * _generate(messages, opts?) → { text, tokens, model, provider }
 *
 * Internal low-level generate. Tries providers in chain order.
 * Throws only when ALL providers fail.
 * Commands should use the high-level generate({ prompt }) API instead.
 */
async function _generate(messages, opts = {}) {
  // If a specific provider was requested in opts, honour it (pin for this call only)
  const requestedProvider = opts.provider && opts.provider !== 'auto'
    ? opts.provider
    : null;

  let chain;
  if (requestedProvider && _chain.includes(requestedProvider)) {
    chain = [requestedProvider, ..._chain.filter(n => n !== requestedProvider)];
  } else if (_preferred) {
    chain = [_preferred, ..._chain.filter(n => n !== _preferred)];
  } else {
    chain = [..._chain];
  }

  if (chain.length === 0) {
    throw new Error('No AI providers available. Configure at least one API key.');
  }

  const errors = [];

  for (const name of chain) {
    const mod = _providers.get(name);
    if (!mod) continue;

    try {
      log.debug(`[ai:manager] Trying provider: ${name}`);
      const result = await mod.generate(messages, opts);
      if (requestedProvider && name !== requestedProvider) {
        log.info(`[AI] provider=${name} status=fallback`);
      }
      return result;
    } catch (e) {
      log.warn(`[ai:manager] Provider ${name} failed: ${e.message}`);
      errors.push(`${name}: ${e.message}`);
    }
  }

  throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
}

// ── Command-facing API ────────────────────────────────────────────────────────

/**
 * generate(promptOptsOrMessages, legacyOpts?) → StandardResult | LegacyResult
 *
 * ── New command API (Phase 7) ─────────────────────────────────────────────────
 *
 *   await ai.generate({ prompt, provider?, model?, maxTokens?, temperature? })
 *   → { success: true,  provider, text, usage: { tokens, model } }
 *   → { success: false, error: string }
 *
 *   provider: "auto" (default) | "gemini" | "groq" | "openrouter" |
 *             "openai" | "puter" | "pollinations"
 *
 * ── Legacy API (backward compat) ─────────────────────────────────────────────
 *
 *   await ai.generate(messages[], opts?)
 *   → { text, tokens, model, provider }
 *
 *   Detected when the first argument is an Array.
 *   Kept so the compat shim (services/ai.js) continues to work unchanged.
 */
export async function generate(promptOptsOrMessages, legacyOpts = {}) {
  // ── Legacy path: generate(messages[], opts) ──────────────────────────────
  if (Array.isArray(promptOptsOrMessages)) {
    return _generate(promptOptsOrMessages, legacyOpts);
  }

  // ── New command path: generate({ prompt, provider, ... }) ────────────────
  const {
    prompt,
    provider = 'auto',
    model,
    maxTokens,
    temperature,
    timeoutMs,
    context,      // optional: additional context string prepended as system msg
  } = promptOptsOrMessages ?? {};

  if (!prompt && !context) {
    return { success: false, error: 'generate(): prompt is required' };
  }

  // Build messages array from prompt + optional context
  const messages = [];
  if (context) {
    messages.push({ role: 'system', content: String(context) });
  }
  messages.push({ role: 'user', content: String(prompt ?? '') });

  const opts = { provider, model, maxTokens, temperature, timeoutMs };

  const startMs = Date.now();
  try {
    const raw     = await _generate(messages, opts);
    const latency = Date.now() - startMs;

    log.info(`[AI] provider=${raw.provider} status=success latency=${latency}ms`);

    return {
      success:  true,
      provider: raw.provider,
      text:     raw.text,
      usage: {
        tokens: raw.tokens ?? 0,
        model:  raw.model  ?? model ?? 'unknown',
      },
    };
  } catch (e) {
    const latency = Date.now() - startMs;
    log.error(`[AI] provider=${provider} status=failed latency=${latency}ms error=${e.message}`);

    return {
      success: false,
      error:   e.message,
    };
  }
}

// ── High-level chat orchestrator ──────────────────────────────────────────────

/**
 * chat(chatJid, senderJid, userText, opts?) → { text, tokens, model, provider }
 *
 * Full conversation turn with history, memory, and system prompt.
 * Used internally by commands/ai.js and services/ai.js.
 */
export async function chat(chatJid, senderJid, userText, opts = {}) {
  // 1. Auto-reset stale sessions (30m idle)
  if (isSessionStale(chatJid)) {
    log.debug(`[ai:manager] Session stale for ${chatJid} — context cleared`);
    clearConvHistory(chatJid);
  }

  // 2. Load history (skippable for one-shot calls)
  const history = opts.skipHistory ? [] : getHistory(chatJid);

  // 3. Build system prompt with memory
  const memoryBlock  = recallForPrompt(senderJid, chatJid);
  const systemPrompt = buildSystemPrompt({
    senderName:     opts.senderName,
    chatName:       opts.chatName,
    personalityKey: opts.personalityKey,
    memoryBlock,
  });

  // 4. Compose messages array
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user',   content: userText },
  ];

  // 5. Generate (via internal _generate to get raw result)
  const startMs = Date.now();
  const result  = await _generate(messages, {
    maxTokens:   opts.maxTokens,
    temperature: opts.temperature,
  });
  const latency = Date.now() - startMs;

  // 6. Persist
  try {
    addTurn(chatJid, senderJid, userText, result.text, result.tokens);
  } catch (dbErr) {
    log.error(`[ai:manager] History write failed: ${dbErr.message}`);
  }

  log.info(`[AI] provider=${result.provider} status=success latency=${latency}ms`);
  log.info(`[ai:manager] ${chatJid} | ${result.provider} | ${result.tokens}tok | "${userText.slice(0, 40)}"`);
  return result;
}

// ── Status / introspection ────────────────────────────────────────────────────

export function getAvailableProviders() {
  return _chain.map(name => {
    const mod = _providers.get(name);
    return {
      name,
      displayName:  mod?.meta?.displayName ?? name,
      free:         mod?.meta?.free        ?? false,
      requiresKey:  mod?.meta?.requiresKey ?? true,
      defaultModel: mod?.meta?.defaultModel ?? '?',
      active:       name === (_preferred ?? _chain[0]),
    };
  });
}

export function getActiveProvider() {
  return _preferred ?? _chain[0] ?? null;
}

export function isAvailable() {
  return _chain.length > 0;
}

export function status() {
  return {
    chain:       _chain,
    preferred:   _preferred,
    active:      getActiveProvider(),
    providers:   getAvailableProviders(),
    initialized: _chain.length > 0 || _providers.size > 0,
  };
}

// ── Re-exports for callers that import from AIManager directly ────────────────

export { clearHistory, getHistory, getHistoryCount } from './ConversationManager.js';
export { remember, recall, forget, getMemoryCount } from './MemoryManager.js';
export { buildSystemPrompt, getPersonalities } from './PromptManager.js';
