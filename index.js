#!/usr/bin/env node
/**
 * Yuzuki AI — Entry point
 *
 * Phase 7 hardened startup sequence:
 *  1. Config validation (warn/error before anything starts)
 *  2. Directory setup
 *  3. Database init + integrity check
 *  4. Auth state setup
 *  5. Plugin load
 *  6. Banner
 *  7. Connection manager + socket
 *  8. Health server (enhanced diagnostics)
 *  9. Graceful shutdown (DB close + WAL checkpoint)
 * 10. Global error safety nets (log stack traces, never silently crash)
 */
import http from 'http';
import { config }                        from './src/config/index.js';
import { log, printBanner }              from './src/utils/logger.js';
import { validateStartup, printValidation } from './src/utils/validate.js';
import { ensureDir }                     from './src/utils/helpers.js';
import {
  initDatabase,
  checkIntegrity,
  closeDatabase,
}                                        from './src/database/index.js';
import { useMultiFileAuth }              from './src/database/auth.js';
import { getBaileysVersion }             from './src/core/socket.js';
import {
  initConnectionManager,
  connect,
  shutdown,
}                                        from './src/core/connection.js';
import { registerEvents }                from './src/events/index.js';
import { pluginManager }                 from './src/plugins/loader.js';
import { getHealth, getHealthSummary }   from './src/services/health.js';

// ── Shutdown orchestrator ─────────────────────────────────────────────────────

let _shuttingDown = false;

function gracefulShutdown(sig) {
  if (_shuttingDown) return;
  _shuttingDown = true;

  log.warn(`[boot] ${sig} received — shutting down`);
  try { shutdown();      } catch (e) { log.error(`[boot] Shutdown error: ${e.message}`); }
  try { closeDatabase(); } catch (e) { log.error(`[boot] DB close error: ${e.message}`); }
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ── 1. Config validation ─────────────────────────────────────────────────
  const validation = validateStartup(config);
  const configOk   = printValidation(validation);
  if (!configOk) {
    log.error('[boot] Aborting — fix the critical configuration errors above, then restart.');
    process.exit(1);
  }

  // ── 2. Directories ────────────────────────────────────────────────────────
  ensureDir(config.sessionDir);
  ensureDir(config.tempDir);
  ensureDir(config.logsDir);

  // ── 3. Database ───────────────────────────────────────────────────────────
  initDatabase(config.dbPath);

  const integrity = checkIntegrity();
  if (!integrity.ok) {
    log.error(`[db] Integrity check FAILED: ${integrity.result ?? integrity.error}`);
    log.warn('[db] Continuing with potentially degraded database');
  } else {
    log.db('[db] Integrity check passed');
  }

  // ── 4. Auth ───────────────────────────────────────────────────────────────
  // useMultiFileAuth is async — session files live in config.sessionDir,
  // not in SQLite. The data store (stats/settings/warns) still uses SQLite.
  const { state: authState, saveCreds, clearCreds } = await useMultiFileAuth(config.sessionDir);

  // ── 5. Baileys version ────────────────────────────────────────────────────
  const version = await getBaileysVersion();
  log.info(`[boot] Baileys: ${version.join('.')}`);

  // ── 6. Plugins ────────────────────────────────────────────────────────────
  const pluginCount = await pluginManager.loadAll();

  // ── 7. Banner ─────────────────────────────────────────────────────────────
  printBanner({ version: config.version, nodeVersion: process.version, pluginCount });

  // ── 8. Connection manager ─────────────────────────────────────────────────
  initConnectionManager({
    authState,
    saveCreds,
    clearCreds,
    onSocketReady: (sock) => {
      log.startup('[boot] Socket ready — registering event handlers');
      try {
        registerEvents(sock);
      } catch (e) {
        log.error(`[boot] Failed to register events: ${e.message}`);
      }
    },
  });

  await connect(version);

  // ── 9. Health server ──────────────────────────────────────────────────────
  if (config.port > 0) {
    const srv = http.createServer((req, res) => {
      try {
        if (req.url === '/health/summary') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(getHealthSummary());
          return;
        }
        const health     = getHealth();
        const statusCode = health.connection.connected ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: e.message }));
      }
    });

    srv.on('error', e =>
      e.code === 'EADDRINUSE'
        ? log.warn(`[health] Port ${config.port} busy — health server disabled`)
        : log.error(`[health] Server error: ${e.message}`)
    );

    srv.listen(config.port, () => {
      log.info(`[health] Listening on :${config.port} (GET / for diagnostics, /health/summary for uptime check)`);
    });
  }

  // ── 10. Signal handlers ───────────────────────────────────────────────────
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // ── 11. Global safety nets ────────────────────────────────────────────────
  process.on('uncaughtException', (e) => {
    log.error(`[boot] uncaughtException: ${e.message}`);
    if (config.debug) log.debug(`[boot] Stack: ${e.stack}`);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    log.error(`[boot] unhandledRejection: ${msg}`);
    if (config.debug && reason instanceof Error) log.debug(`[boot] Stack: ${reason.stack}`);
  });
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  if (config?.debug) console.error(e.stack);
  process.exit(1);
});
