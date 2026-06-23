#!/usr/bin/env node
import http from 'http';
import { config } from './src/config/index.js';
import { log, printBanner } from './src/utils/logger.js';
import { ensureDir } from './src/utils/helpers.js';
import { initDatabase } from './src/database/index.js';
import { useSQLiteAuthState } from './src/database/auth.js';
import { getBaileysVersion } from './src/core/socket.js';
import { initConnectionManager, connect, shutdown, getSocket } from './src/core/connection.js';
import { registerEvents } from './src/events/index.js';
import { pluginManager } from './src/plugins/loader.js';

async function main() {
  // ── Directories ───────────────────────────────────────────────────────────
  ensureDir(config.sessionDir);
  ensureDir(config.tempDir);
  ensureDir(config.logsDir);

  // ── Database ──────────────────────────────────────────────────────────────
  initDatabase(config.dbPath);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { state: authState, saveCreds, clearCreds } = useSQLiteAuthState(config.dbPath);

  // ── Baileys version ───────────────────────────────────────────────────────
  const version = await getBaileysVersion();
  log.info(`[boot] Baileys: ${version.join('.')}`);

  // ── Plugins (load before banner so count is accurate) ────────────────────
  const pluginCount = await pluginManager.loadAll();

  // ── Banner ────────────────────────────────────────────────────────────────
  printBanner({ version: config.version, nodeVersion: process.version, pluginCount });

  // ── Connection manager ────────────────────────────────────────────────────
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

  // ── Health server ─────────────────────────────────────────────────────────
  if (config.port > 0) {
    const srv = http.createServer((_, res) => {
      const s       = getSocket();
      const plugins = pluginManager.getStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status:    'running',
        bot:       config.botName,
        version:   config.version,
        connected: !!s,
        jid:       s?.user?.id ?? null,
        uptime:    process.uptime(),
        plugins,
        ts:        new Date().toISOString(),
      }));
    });
    srv.on('error', e =>
      e.code === 'EADDRINUSE'
        ? log.warn(`[health] Port ${config.port} busy — skipping`)
        : log.error(`[health] ${e.message}`)
    );
    srv.listen(config.port, () =>
      log.info(`[health] Listening on :${config.port}`)
    );
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────
  const bye = (sig) => {
    log.warn(`[boot] ${sig} received — shutting down`);
    shutdown();
    process.exit(0);
  };
  process.on('SIGINT',  () => bye('SIGINT'));
  process.on('SIGTERM', () => bye('SIGTERM'));

  // ── Global safety nets ────────────────────────────────────────────────────
  process.on('uncaughtException',  e => log.error(`[boot] uncaughtException: ${e.message}`));
  process.on('unhandledRejection', r => log.error(`[boot] unhandledRejection: ${r}`));
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
