import { DatabaseSync } from 'node:sqlite';
import { renameSync }   from 'fs';
import { SCHEMA_SQL }   from './schema.js';
import { log }          from '../utils/logger.js';

let _db = null;

/**
 * initDatabase(dbPath) → DatabaseSync
 *
 * Opens (or creates) the SQLite database, applies schema, and returns the instance.
 * Idempotent — returns the existing instance if already initialized.
 *
 * Corruption recovery: if the database file is corrupt, it is renamed to
 * <path>.backup-<ts> and a fresh database is created in its place.
 */
export function initDatabase(dbPath) {
  if (_db) { log.warn('[db] Already initialized'); return _db; }

  // First attempt
  try {
    _db = new DatabaseSync(dbPath);
    _db.exec(SCHEMA_SQL);
    log.db(`[db] Initialized: ${dbPath}`);
    return _db;
  } catch (openErr) {
    log.error(`[db] Open failed: ${openErr.message}`);
  }

  // Corruption recovery — rename the bad file and start fresh
  try {
    const backup = `${dbPath}.backup-${Date.now()}`;
    renameSync(dbPath, backup);
    log.warn(`[db] Renamed corrupt database to ${backup} — creating fresh`);
  } catch (renameErr) {
    log.warn(`[db] Could not rename corrupt DB: ${renameErr.message}`);
  }

  // Second attempt on fresh file
  try {
    _db = new DatabaseSync(dbPath);
    _db.exec(SCHEMA_SQL);
    log.db(`[db] Fresh database initialized: ${dbPath}`);
    return _db;
  } catch (fatalErr) {
    log.error(`[db] Fatal: cannot open database: ${fatalErr.message}`);
    throw fatalErr;
  }
}

/**
 * getDatabase() → DatabaseSync
 * Returns the initialized database instance. Throws if not yet initialized.
 */
export function getDatabase() {
  if (!_db) throw new Error('[db] Database not initialized — call initDatabase() first');
  return _db;
}

/**
 * checkIntegrity() → { ok: boolean, result?: string, error?: string }
 *
 * Runs PRAGMA integrity_check. Safe to call at any time — does not modify data.
 * Returns immediately with ok=false if DB is not initialized.
 */
export function checkIntegrity() {
  if (!_db) return { ok: false, error: 'Not initialized' };
  try {
    const row = _db.prepare('PRAGMA integrity_check').get();
    const ok  = row?.integrity_check === 'ok';
    return { ok, result: row?.integrity_check ?? 'unknown' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * closeDatabase()
 *
 * Flushes the WAL to the main file then closes the database.
 * Must be called during shutdown before process.exit().
 * Safe to call if DB is not open (no-op).
 */
export function closeDatabase() {
  if (!_db) return;
  try {
    _db.exec('PRAGMA wal_checkpoint(FULL)');
    log.db('[db] WAL checkpoint complete');
  } catch (e) {
    log.warn(`[db] WAL checkpoint failed: ${e.message}`);
  }
  try {
    _db.close();
    log.db('[db] Closed');
  } catch (e) {
    log.warn(`[db] Close failed: ${e.message}`);
  }
  _db = null;
}

export * from './store.js';
