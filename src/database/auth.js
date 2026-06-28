/**
 * Multi-File Auth State Adapter
 *
 * Delegates entirely to Baileys' built-in useMultiFileAuthState so that
 * all session data (creds.json + pre-key files) is written to the session
 * directory instead of SQLite.
 *
 * Directory layout (inside config.sessionDir):
 *   creds.json          — identity / registration state
 *   app-state-sync-*.json, pre-key-*.json, ... — key material
 */
import { createRequire } from 'module';
import path from 'path';
import fs   from 'fs';
import { log } from '../utils/logger.js';

const _req = createRequire(import.meta.url);
const { useMultiFileAuthState } = _req('baileys');

/**
 * useMultiFileAuth(sessionDir) → { state, saveCreds, clearCreds }
 *
 * Drop-in replacement for useSQLiteAuthState.
 * saveCreds is already provided by Baileys; clearCreds wipes the session folder.
 */
export async function useMultiFileAuth(sessionDir) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const jid = state?.creds?.me?.id ?? null;
  if (jid) {
    log.auth(`[auth] Restored session (jid:${jid})`);
  } else {
    log.auth('[auth] Fresh session — pairing required');
  }

  const clearCreds = () => {
    try {
      const files = fs.readdirSync(sessionDir);
      for (const f of files) {
        try { fs.rmSync(path.join(sessionDir, f), { recursive: true, force: true }); } catch {}
      }
      log.auth('[auth] Session cleared');
    } catch (e) {
      log.warn(`[auth] Could not clear session directory: ${e.message}`);
    }
  };

  log.db('[auth] Multi-file auth adapter ready');
  return { state, saveCreds, clearCreds };
}

/**
 * hasValidSession(sessionDir) → boolean
 *
 * Returns true if creds.json exists and contains a paired JID.
 * Used to skip unnecessary pairing attempts on reconnect.
 */
export function hasValidSession(sessionDir) {
  try {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return !!(creds?.me?.id);
  } catch {
    return false;
  }
}
