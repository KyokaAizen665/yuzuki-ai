/**
 * ConversationManager — Phase 6
 *
 * Manages per-chat conversation history backed by the existing `ai_history` table.
 * Each chat (user DM or group) maintains isolated history.
 *
 * Extends the Phase 5 history system with:
 *   - Conversation sessions (auto-reset on inactivity)
 *   - Token budget awareness
 *   - Stat tracking (message count, token spend)
 *
 * Public API:
 *   addTurn(chatJid, senderJid, userText, assistantText, tokens?)
 *   getHistory(chatJid, limit?)     → { role, content }[]
 *   clearHistory(chatJid)           → number deleted
 *   getHistoryCount(chatJid)        → number
 *   isSessionStale(chatJid, maxIdleMs?) → boolean
 *   trimToLimit(chatJid, maxPairs)
 */
import { getDatabase } from '../../database/index.js';
import { log }         from '../../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_PAIRS = 20;          // user+assistant pairs to keep per chat
const SESSION_IDLE_MS   = 30 * 60_000; // 30 minutes — reset session context

// ── Helpers ───────────────────────────────────────────────────────────────────

function db() { return getDatabase(); }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getHistory(chatJid, limit?) → { role, content }[]
 *
 * Returns the last `limit` messages oldest-first — ready for the AI messages array.
 * Filters out any system rows stored historically.
 */
export function getHistory(chatJid, limit = DEFAULT_MAX_PAIRS * 2) {
  try {
    const rows = db().prepare(
      `SELECT role, content FROM ai_history
       WHERE chatJid=? AND role IN ('user','assistant')
       ORDER BY createdAt DESC
       LIMIT ?`
    ).all(chatJid, limit);
    return rows.reverse(); // oldest first for AI payload
  } catch (e) {
    log.error(`[conv] getHistory error: ${e.message}`);
    return [];
  }
}

/**
 * addTurn(chatJid, senderJid, userText, assistantText, tokens?)
 *
 * Persists one full user→assistant exchange then trims old history.
 */
export function addTurn(chatJid, senderJid, userText, assistantText, tokens = null) {
  try {
    const d    = db();
    const stmt = d.prepare(
      'INSERT INTO ai_history (chatJid, senderJid, role, content, tokens) VALUES (?,?,?,?,?)'
    );
    stmt.run(chatJid, senderJid, 'user',      userText,      null);
    stmt.run(chatJid, null,      'assistant', assistantText, tokens);

    // Auto-trim to cap
    trimToLimit(chatJid, DEFAULT_MAX_PAIRS);
  } catch (e) {
    log.error(`[conv] addTurn error: ${e.message}`);
  }
}

/**
 * clearHistory(chatJid) → number of deleted rows
 */
export function clearHistory(chatJid) {
  try {
    return db().prepare('DELETE FROM ai_history WHERE chatJid=?').run(chatJid).changes;
  } catch (e) {
    log.error(`[conv] clearHistory error: ${e.message}`);
    return 0;
  }
}

/**
 * getHistoryCount(chatJid) → number of stored messages
 */
export function getHistoryCount(chatJid) {
  try {
    return db().prepare(
      "SELECT COUNT(*) AS n FROM ai_history WHERE chatJid=? AND role IN ('user','assistant')"
    ).get(chatJid)?.n ?? 0;
  } catch { return 0; }
}

/**
 * isSessionStale(chatJid, maxIdleMs?) → boolean
 *
 * Returns true when the last message in this chat is older than maxIdleMs.
 * Use this to decide whether to clear context before a new turn.
 */
export function isSessionStale(chatJid, maxIdleMs = SESSION_IDLE_MS) {
  try {
    const row = db().prepare(
      'SELECT createdAt FROM ai_history WHERE chatJid=? ORDER BY createdAt DESC LIMIT 1'
    ).get(chatJid);
    if (!row) return false; // no history = not stale, just new
    const lastMs = new Date(row.createdAt).getTime();
    return Date.now() - lastMs > maxIdleMs;
  } catch { return false; }
}

/**
 * trimToLimit(chatJid, maxPairs)
 *
 * Keeps only the most recent maxPairs*2 rows for this chat.
 */
export function trimToLimit(chatJid, maxPairs = DEFAULT_MAX_PAIRS) {
  try {
    const keep = Math.max(2, maxPairs) * 2;
    db().prepare(
      `DELETE FROM ai_history
       WHERE chatJid=? AND id NOT IN (
         SELECT id FROM ai_history WHERE chatJid=? ORDER BY createdAt DESC LIMIT ?
       )`
    ).run(chatJid, chatJid, keep);
  } catch (e) {
    log.error(`[conv] trimToLimit error: ${e.message}`);
  }
}

/**
 * getLastActivity(chatJid) → Date | null
 */
export function getLastActivity(chatJid) {
  try {
    const row = db().prepare(
      'SELECT createdAt FROM ai_history WHERE chatJid=? ORDER BY createdAt DESC LIMIT 1'
    ).get(chatJid);
    return row ? new Date(row.createdAt) : null;
  } catch { return null; }
}
