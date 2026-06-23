/**
 * MemoryManager — Phase 6
 *
 * Structured, persistent memory for users and chats.
 * Backed by the `ai_memory` SQLite table (added to schema in this phase).
 *
 * Memory types:
 *   user   — facts about a specific user (across all chats)
 *   chat   — facts about a specific chat/group context
 *   global — bot-wide facts (accessible in every conversation)
 *
 * Public API:
 *   remember(type, ownerJid, key, value, opts?)
 *   recall(type, ownerJid, limit?)      → memory[]
 *   forget(type, ownerJid, key?)
 *   recallForPrompt(ownerJid, chatJid)  → formatted string
 *   cleanup()                           → deleted rows count
 */
import { getDatabase } from '../../database/index.js';
import { log }         from '../../utils/logger.js';
import { formatMemoryBlock } from './PromptManager.js';

// ── Limits ────────────────────────────────────────────────────────────────────

const MAX_USER_MEMORIES   = 50;  // facts per user
const MAX_CHAT_MEMORIES   = 30;  // facts per chat
const MAX_GLOBAL_MEMORIES = 20;  // global facts

// ── Helpers ───────────────────────────────────────────────────────────────────

function db() { return getDatabase(); }

function maxFor(type) {
  return type === 'user' ? MAX_USER_MEMORIES
       : type === 'chat' ? MAX_CHAT_MEMORIES
       : MAX_GLOBAL_MEMORIES;
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * remember(type, ownerJid, key, value, opts?)
 *
 * Upserts a memory fact. If the user/chat is at their limit the lowest-importance
 * fact is deleted first to make room (LRU by importance then age).
 *
 * @param {'user'|'chat'|'global'} type
 * @param {string|null} ownerJid  — userJid for 'user', chatJid for 'chat', null for 'global'
 * @param {string}  key           — fact label (e.g. "name", "language", "job")
 * @param {string}  value         — fact content
 * @param {{ importance?: number, expiresInDays?: number }} [opts]
 */
export function remember(type, ownerJid, key, value, opts = {}) {
  try {
    const d          = db();
    const importance = opts.importance ?? 5;
    const expiresAt  = opts.expiresInDays
      ? new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString()
      : null;

    // Enforce limits — delete oldest/least-important fact if at cap
    const count = d.prepare(
      'SELECT COUNT(*) AS n FROM ai_memory WHERE memoryType=? AND ownerJid IS ?'
    ).get(type, ownerJid ?? null)?.n ?? 0;

    if (count >= maxFor(type)) {
      d.prepare(
        `DELETE FROM ai_memory WHERE id = (
           SELECT id FROM ai_memory
           WHERE memoryType=? AND ownerJid IS ?
           ORDER BY importance ASC, updatedAt ASC
           LIMIT 1
         )`
      ).run(type, ownerJid ?? null);
    }

    d.prepare(
      `INSERT INTO ai_memory (memoryType, ownerJid, key, value, importance, expiresAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(memoryType, ownerJid, key)
       DO UPDATE SET value=excluded.value, importance=excluded.importance,
                     expiresAt=excluded.expiresAt, updatedAt=CURRENT_TIMESTAMP`
    ).run(type, ownerJid ?? null, key.toLowerCase().trim(), value, importance, expiresAt);

    log.debug(`[memory] ${type}:${ownerJid ?? 'global'} "${key}" = "${value.slice(0, 40)}"`);
  } catch (e) {
    log.error(`[memory] remember error: ${e.message}`);
  }
}

/**
 * recall(type, ownerJid, limit?) → { key, value, importance, updatedAt }[]
 *
 * Returns memories ordered by importance desc, then newest first.
 * Automatically filters expired entries.
 */
export function recall(type, ownerJid, limit = 20) {
  try {
    return db().prepare(
      `SELECT key, value, importance, updatedAt FROM ai_memory
       WHERE memoryType=? AND ownerJid IS ?
         AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
       ORDER BY importance DESC, updatedAt DESC
       LIMIT ?`
    ).all(type, ownerJid ?? null, limit);
  } catch (e) {
    log.error(`[memory] recall error: ${e.message}`);
    return [];
  }
}

/**
 * forget(type, ownerJid, key?)
 *
 * Deletes a specific key or ALL memories for this type+owner.
 */
export function forget(type, ownerJid, key = null) {
  try {
    if (key) {
      db().prepare(
        'DELETE FROM ai_memory WHERE memoryType=? AND ownerJid IS ? AND key=?'
      ).run(type, ownerJid ?? null, key.toLowerCase().trim());
    } else {
      db().prepare(
        'DELETE FROM ai_memory WHERE memoryType=? AND ownerJid IS ?'
      ).run(type, ownerJid ?? null);
    }
  } catch (e) {
    log.error(`[memory] forget error: ${e.message}`);
  }
}

/**
 * recallForPrompt(userJid, chatJid) → string
 *
 * Combines relevant user + chat + global memories into a formatted block
 * ready to inject into the system prompt.
 */
export function recallForPrompt(userJid, chatJid) {
  try {
    const userMem   = recall('user',   userJid, 10);
    const chatMem   = recall('chat',   chatJid, 5);
    const globalMem = recall('global', null,    5);
    const all       = [...globalMem, ...chatMem, ...userMem];
    return formatMemoryBlock(all);
  } catch (e) {
    log.error(`[memory] recallForPrompt error: ${e.message}`);
    return '';
  }
}

/**
 * getMemoryCount(type, ownerJid) → number
 */
export function getMemoryCount(type, ownerJid) {
  try {
    return db().prepare(
      'SELECT COUNT(*) AS n FROM ai_memory WHERE memoryType=? AND ownerJid IS ?'
    ).get(type, ownerJid ?? null)?.n ?? 0;
  } catch { return 0; }
}

/**
 * cleanup() → number
 *
 * Deletes expired memory entries. Call periodically (handled by AIManager).
 */
export function cleanup() {
  try {
    const { changes } = db().prepare(
      "DELETE FROM ai_memory WHERE expiresAt IS NOT NULL AND expiresAt <= CURRENT_TIMESTAMP"
    ).run();
    if (changes) log.debug(`[memory] Cleaned up ${changes} expired entries`);
    return changes;
  } catch (e) {
    log.error(`[memory] cleanup error: ${e.message}`);
    return 0;
  }
}
