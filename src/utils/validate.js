/**
 * Startup Validator — Phase 7
 *
 * Validates configuration and environment before the bot connects.
 * Prints clear warnings/errors so operators know exactly what is wrong.
 *
 * Design principles:
 *   - Issues ([]string)  — things that will cause runtime failures
 *   - Warnings ([]string) — things that degrade functionality but are not fatal
 *   - Never throws — always returns a result object
 *   - All checks idempotent — safe to call multiple times
 *
 * Public API:
 *   validateStartup(cfg) → { ok, issues, warnings }
 *   printValidation(result) — logs issues/warnings to console
 */
import path from 'path';
import fs   from 'fs';
import { log } from './logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function issue(issues, msg) { issues.push(msg); }
function warn(warnings, msg) { warnings.push(msg); }

// ── Validation checks ─────────────────────────────────────────────────────────

/**
 * validateStartup(cfg) → { ok: boolean, issues: string[], warnings: string[] }
 *
 * ok = false when there is at least one critical issue.
 * Warnings are informational — the bot can still start.
 */
export function validateStartup(cfg) {
  const issues   = [];
  const warnings = [];

  // ── Node.js version ────────────────────────────────────────────────────────
  const nodeVer = process.version.slice(1).split('.').map(Number);
  if (nodeVer[0] < 22) {
    issue(issues, `Node.js ${process.version} is too old — node:sqlite requires v22.5.0+`);
  }

  // ── OWNER_NUMBER ───────────────────────────────────────────────────────────
  if (!cfg.ownerNumber) {
    warn(warnings, 'OWNER_NUMBER not set — owner-only commands will be inaccessible');
  } else if (!/^\d{7,15}$/.test(cfg.ownerNumber)) {
    warn(warnings, `OWNER_NUMBER "${cfg.ownerNumber}" looks malformed — expected 7–15 digits only`);
  }

  // ── Database path ─────────────────────────────────────────────────────────
  const dbDir = path.dirname(path.resolve(cfg.dbPath));
  if (!fs.existsSync(dbDir)) {
    issue(issues, `Database directory does not exist: ${dbDir}`);
  }

  // ── AI providers (optional but useful) ───────────────────────────────────
  const hasGroq       = !!cfg.groqApiKey;
  const hasGemini     = !!cfg.geminiApiKey;
  const hasOpenRouter = !!cfg.openrouterApiKey;
  if (!hasGroq && !hasGemini && !hasOpenRouter) {
    warn(warnings,
      'No AI provider API keys configured ' +
      '(GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY) — ' +
      'using Pollinations.ai (free, no key) as fallback'
    );
  }

  // ── BOT_NAME ──────────────────────────────────────────────────────────────
  if (!cfg.botName || !cfg.botName.trim()) {
    warn(warnings, 'BOT_NAME is empty — defaulting to "Yuzuki AI"');
  }

  // ── PREFIX ────────────────────────────────────────────────────────────────
  if (!cfg.prefix || cfg.prefix.length > 3) {
    warn(warnings, `PREFIX "${cfg.prefix}" is missing or unusually long — expected 1–3 chars`);
  }

  // ── PORT ──────────────────────────────────────────────────────────────────
  if (cfg.port < 0 || cfg.port > 65535) {
    issue(issues, `PORT ${cfg.port} is out of valid range (0–65535)`);
  }

  // ── Temp / logs dirs (non-fatal if missing — ensureDir creates them) ───────
  // No issue needed — main() calls ensureDir() which handles creation

  return {
    ok:       issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * printValidation(result) — logs all issues and warnings, returns ok flag.
 */
export function printValidation(result) {
  for (const w of result.warnings) {
    log.warn(`[validate] ⚠  ${w}`);
  }
  for (const e of result.issues) {
    log.error(`[validate] ✖  ${e}`);
  }
  if (!result.ok) {
    log.error('[validate] Critical issues detected — bot may not function correctly');
  } else if (!result.warnings.length) {
    log.info('[validate] Configuration OK');
  }
  return result.ok;
}
