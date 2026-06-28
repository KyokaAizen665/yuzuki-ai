/**
 * Health Service — Phase 7
 *
 * Centralised health/diagnostics aggregator.
 * Consumed by the HTTP health endpoint in index.js.
 *
 * getHealth() is synchronous — safe to call from any request handler.
 * All sub-checks are wrapped in try/catch — a failing sub-system
 * never prevents the health endpoint from responding.
 *
 * Public API:
 *   getHealth()        → full diagnostic object
 *   getHealthSummary() → one-line string summary
 */
import { config }        from '../config/index.js';
import { getSocket }     from '../core/connection.js';
import { pluginManager } from '../plugins/loader.js';
import { getDatabase }   from '../database/index.js';
import { getStat }       from '../database/store.js';
import * as AIManager    from './ai/AIManager.js';
import { formatUptime }  from '../utils/helpers.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mb = bytes => parseFloat((bytes / 1024 / 1024).toFixed(1));

// ── Sub-system checks ─────────────────────────────────────────────────────────

function _systemHealth() {
  const mem = process.memoryUsage();
  return {
    node:        process.version,
    platform:    process.platform,
    uptime:      parseFloat(process.uptime().toFixed(1)),
    uptimeHuman: formatUptime(process.uptime() * 1000),
    pid:         process.pid,
    memory: {
      heapUsedMB:   mb(mem.heapUsed),
      heapTotalMB:  mb(mem.heapTotal),
      rssMB:        mb(mem.rss),
      externalMB:   mb(mem.external),
      heapUsagePct: parseFloat(((mem.heapUsed / mem.heapTotal) * 100).toFixed(1)),
    },
  };
}

function _connectionHealth() {
  try {
    const sock = getSocket();
    return {
      connected: !!sock,
      jid:       sock?.user?.id   ?? null,
      name:      sock?.user?.name ?? null,
    };
  } catch {
    return { connected: false, jid: null, name: null };
  }
}

function _databaseHealth() {
  try {
    const db  = getDatabase();
    const row = db.prepare('PRAGMA integrity_check').get();
    const ok  = row?.integrity_check === 'ok';
    return { ok, result: row?.integrity_check ?? 'unknown' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function _aiHealth() {
  try {
    const s = AIManager.status();
    return {
      initialized:   s.initialized,
      active:        s.active     ?? null,
      preferred:     s.preferred  ?? null,
      chain:         s.chain,
      providerCount: s.providers.length,
      providers:     s.providers.map(p => ({
        name:        p.name,
        displayName: p.displayName,
        active:      p.active,
        free:        p.free,
        requiresKey: p.requiresKey,
      })),
    };
  } catch (e) {
    return { initialized: false, error: e.message };
  }
}

function _pluginHealth() {
  try {
    return pluginManager.getStatus();
  } catch {
    return { loaded: 0, errors: 0 };
  }
}

function _stats() {
  try {
    return {
      messages_total: getStat('messages_total'),
      commands_total: getStat('commands_total'),
    };
  } catch {
    return { messages_total: 0, commands_total: 0 };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getHealth() → full diagnostic object
 *
 * Always returns a complete object — individual failures are reported inline.
 */
export function getHealth() {
  const conn = _connectionHealth();
  return {
    status:     conn.connected ? 'connected' : 'connecting',
    bot:        config.botName,
    version:    config.version,
    system:     _systemHealth(),
    connection: conn,
    database:   _databaseHealth(),
    ai:         _aiHealth(),
    plugins:    _pluginHealth(),
    stats:      _stats(),
    ts:         new Date().toISOString(),
  };
}

/**
 * getHealthSummary() → one-line human-readable string
 *
 * Example: "uptime=3m 12s | heap=45.2/128MB (35.3%) | connected=true | ai=groq | plugins=6"
 */
export function getHealthSummary() {
  try {
    const h   = getHealth();
    const mem = h.system.memory;
    return (
      `uptime=${h.system.uptimeHuman} | ` +
      `heap=${mem.heapUsedMB}/${mem.heapTotalMB}MB (${mem.heapUsagePct}%) | ` +
      `connected=${h.connection.connected} | ` +
      `ai=${h.ai.active ?? 'none'} | ` +
      `plugins=${h.plugins.loaded} | ` +
      `msgs=${h.stats.messages_total}`
    );
  } catch (e) {
    return `health error: ${e.message}`;
  }
}
