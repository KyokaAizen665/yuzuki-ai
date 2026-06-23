/**
 * AI Service — Phase 6 compatibility shim
 *
 * All original exports are preserved so existing code (handlers/message.js,
 * commands/ai.js) continues to work without modification.
 *
 * Internals now delegate to the Phase 6 modular system:
 *   AIManager        — provider selection + fallback
 *   ConversationManager — history
 *   MemoryManager    — user/chat facts
 *   PromptManager    — system prompts
 */
import { config }       from '../config/index.js';
import { getSetting, setSetting } from '../database/store.js';
import { log }          from '../utils/logger.js';

import * as AIManager   from './ai/AIManager.js';
import {
  getHistory,
  addTurn,
  clearHistory,
  getHistoryCount,
  trimToLimit,
}                       from './ai/ConversationManager.js';
import { buildSystemPrompt } from './ai/PromptManager.js';

// ── Lazy init ─────────────────────────────────────────────────────────────────

let _initialized = false;

async function ensureInit() {
  if (_initialized) return;
  _initialized = true;
  await AIManager.init();
}

// ── Legacy API (Phase 5 compat) ───────────────────────────────────────────────

/**
 * callGroq(messages, opts) → { text, tokens }
 *
 * Now routes through AIManager (uses the groq provider if available,
 * falls back to next provider in chain). Kept for backward compat.
 */
export async function callGroq(messages, overrides = {}) {
  await ensureInit();
  return AIManager.generate(messages, overrides);
}

/**
 * chat(chatJid, senderJid, userText, opts) → { text, tokens }
 *
 * Full conversation turn — delegates to AIManager.chat().
 */
export async function chat(chatJid, senderJid, userText, opts = {}) {
  await ensureInit();
  return AIManager.chat(chatJid, senderJid, userText, opts);
}

// ── History (re-exported from ConversationManager) ────────────────────────────

export { getHistory, clearHistory, getHistoryCount };

// ── Settings ──────────────────────────────────────────────────────────────────

export function isAIEnabled() {
  if (!AIManager.isAvailable() && !config.groqApiKey) return false;
  return getSetting('ai_enabled') !== 'false';
}

export function isAIEnabledForChat(chatJid) {
  if (!isAIEnabled()) return false;
  const perChat = getSetting(`ai_${chatJid}`);
  if (perChat === 'true')  return true;
  if (perChat === 'false') return false;
  return true;
}

export function setAIForChat(chatJid, enabled) {
  setSetting(`ai_${chatJid}`, enabled ? 'true' : 'false');
}

export function setPassiveDM(enabled) {
  setSetting('ai_passive_dm', enabled ? 'true' : 'false');
}

export function isPassiveDMEnabled() {
  return getSetting('ai_passive_dm') === 'true';
}

// ── Prompt ────────────────────────────────────────────────────────────────────

export { buildSystemPrompt };

// ── Manager access (new Phase 6 API) ─────────────────────────────────────────

export { AIManager };
export { ensureInit as initAI };
