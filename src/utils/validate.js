/**
 * Startup Validator — Phase 7
 *
 * Validates configuration and environment before the bot connects.
 * Prints clear warnings/errors so operators know exactly what is wrong.
 *
 * Design principles:
 *   - issues   (string[]) — things that WILL cause runtime failures
 *   - warnings (string[]) — things that degrade functionality but are non-fatal
 *   - Never throws — always returns a result object
 *   - All checks idempotent — safe to call multiple times
 *
 * Public API:
 *   validateStartup(cfg) → { ok, issues, warnings }
 *   printValidation(result) — logs issues/warnings, returns ok flag
 */
import path from 'path';
import fs   from 'fs';
import { log } from './logger.js';

function issue(arr, msg) { arr.push(msg); }
function warn(arr, msg)  { arr.push(msg); }

/**
 * validateStartup(cfg) → { ok: boolean, issues: string[], warnings: string[] }
 *
 * ok = false when there is at least one critical issue.
 */
export function validateStartup(cfg) {
  const issues   = [];
  const warnings = [];

  // ── Node.js version ────────────────────────────────────────────────────────
  const nodeVer = process.version.slice(1).split('.').map(Number);
  if (nodeVer[0] < 22 || (nodeVer[0] === 22 && nodeVer[1] < 5)) {
    issue(issues, `Node.js ${process.version} is too old — requires v22.5.0+ (node:sqlite). Current: ${process.version}`);
  }

  // ── OWNER_NUMBER ───────────────────────────────────────────────────────────
  // This is a CRITICAL issue on headless servers: without it the bot cannot
  // complete pairing (promptPhoneNumber() throws immediately on headless).
  if (!cfg.ownerNumber) {
    issue(issues,
      'OWNER_NUMBER is not set — pairing will fail on a headless server. ' +
      'Set OWNER_NUMBER=<country-code><number> (digits only, no +) in your .env or environment variables. ' +
      'Example: OWNER_NUMBER=233533416608',
    );
  } else if (!/^\d{7,15}$/.test(cfg.ownerNumber)) {
    issue(issues,
      `OWNER_NUMBER "${cfg.ownerNumber}" is invalid — expected 7–15 digits only (no +, no spaces, no dashes). ` +
      'Example: OWNER_NUMBER=233533416608',
    );
  }

  // ── AI providers (optional but useful) ────────────────────────────────────
  if (!cfg.groqApiKey && !cfg.geminiApiKey && !cfg.openrouterApiKey) {
    warn(warnings,
      'No AI provider API keys configured (GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY) — ' +
      'using Pollinations.ai (free, no key) as fallback. AI quality may be lower.',
    );
  }

  // ── BOT_NAME ──────────────────────────────────────────────────────────────
  if (!cfg.botName?.trim()) {
    warn(warnings, 'BOT_NAME is empty — defaulting to "Yuzuki AI"');
  }

  // ── PREFIX ────────────────────────────────────────────────────────────────
  if (!cfg.prefix || cfg.prefix.length > 3) {
    warn(warnings, `PREFIX "${cfg.prefix}" is missing or longer than 3 characters`);
  }

  // ── PORT ──────────────────────────────────────────────────────────────────
  if (cfg.port < 0 || cfg.port > 65535) {
    issue(issues, `PORT ${cfg.port} is out of valid range (0–65535) — set PORT=3000 or any available port`);
  }

  // ── MAX_RECONNECT ─────────────────────────────────────────────────────────
  if (cfg.maxReconnectAttempts === 0) {
    warn(warnings, 'MAX_RECONNECT=0 — unlimited reconnect attempts. Bot will never exit on repeated failures.');
  }

  // ── Writable paths ────────────────────────────────────────────────────────
  // Non-fatal: main() calls ensureDir() which creates them.
  // But surface a warning if the parent is not writable.
  for (const [key, dir] of [['SESSION_DIR', cfg.sessionDir], ['LOGS_DIR', cfg.logsDir]]) {
    const parent = path.resolve(path.dirname(dir === '.' ? dir + '/x' : dir));
    try {
      fs.accessSync(parent, fs.constants.W_OK);
    } catch {
      warn(warnings, `${key} parent directory "${parent}" may not be writable — check permissions`);
    }
  }

  return { ok: issues.length === 0, issues, warnings };
}

/**
 * printValidation({ ok, issues, warnings }) → boolean
 *
 * Logs all issues (error level) and warnings (warn level).
 * Returns true if no critical issues.
 */
export function printValidation(result) {
  for (const w of result.warnings) {
    log.warn(`[validate] ⚠  ${w}`);
  }
  for (const e of result.issues) {
    log.error(`[validate] ✖  ${e}`);
  }

  if (!result.ok) {
    log.error('[validate] ── Critical startup issues detected ──────────────────────────');
    log.error('[validate]    Fix the above errors before the bot can pair successfully.');
    log.error('[validate] ────────────────────────────────────────────────────────────');
  } else if (result.warnings.length === 0) {
    log.info('[validate] ✅ Configuration OK');
  } else {
    log.info('[validate] ✅ Configuration OK (with warnings)');
  }

  return result.ok;
}
