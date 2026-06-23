/**
 * Plugin Manager — Phase 3
 *
 * Auto-discovers, loads, unloads, and hot-reloads plugin files from
 * src/commands/. Each plugin is an ES module file; broken plugins are
 * isolated, logged, and never crash the bot.
 *
 * ── Plugin file contract ────────────────────────────────────────────────────
 *
 * Option A — named exports (preferred):
 *
 *   export const meta = {
 *     name:        'ping',            // required — canonical command name
 *     description: 'Check latency',  // required — shown in .help
 *     category:    'utility',        // optional — defaults to 'general'
 *     aliases:     ['p'],            // optional — alternate trigger names
 *     cooldown:    3,                // optional — seconds between uses
 *     owner:       false,            // optional — owner-only flag
 *     premium:     false,            // optional — premium-only flag
 *     group:       null,             // null=any | true=group-only | false=dm-only
 *   };
 *   export async function handler(ctx) { ... }
 *
 * Option B — default export (also supported):
 *
 *   export default { meta: { ... }, handler: async (ctx) => { ... } };
 *
 * Filenames starting with '_' are skipped (private / utility files).
 * Sub-directories are scanned recursively.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { log } from '../utils/logger.js';
import {
  registerCommand,
  unregisterCommand,
  commands,
  loadErrors,
  getCommandCount,
} from './registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the commands directory */
export const COMMANDS_DIR = path.resolve(__dirname, '../commands');

// ── Validation ────────────────────────────────────────────────────────────────

function validateMod(mod) {
  // Support named exports OR default export
  const meta    = mod.meta    ?? mod.default?.meta;
  const handler = mod.handler ?? mod.default?.handler;

  if (!meta || typeof meta !== 'object') {
    throw new Error("Plugin must export a 'meta' object");
  }
  if (typeof meta.name !== 'string' || !meta.name.trim()) {
    throw new Error("meta.name must be a non-empty string");
  }
  if (typeof handler !== 'function') {
    throw new Error("Plugin must export an async 'handler' function");
  }
  return { meta, handler };
}

// ── Discovery ─────────────────────────────────────────────────────────────────

function discoverFiles(dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...discoverFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !entry.name.startsWith('_')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── PluginManager ─────────────────────────────────────────────────────────────

export class PluginManager {
  constructor() {
    /** Set<filePath> — currently tracked plugin files */
    this._tracked = new Set();
  }

  /**
   * loadAll() → number
   * Discovers and loads every .js plugin from COMMANDS_DIR.
   * Returns count of successfully loaded plugins.
   */
  async loadAll() {
    if (!fs.existsSync(COMMANDS_DIR)) {
      log.warn(`[plugins] Creating missing commands dir: ${COMMANDS_DIR}`);
      fs.mkdirSync(COMMANDS_DIR, { recursive: true });
    }

    const files = discoverFiles(COMMANDS_DIR);
    if (!files.length) {
      log.warn('[plugins] No plugin files found in commands/');
      return 0;
    }

    let loaded = 0;
    for (const file of files) {
      if (await this.loadFile(file)) loaded++;
    }

    log.plugin(`[plugins] ✓ Loaded ${loaded}/${files.length} plugin(s)`);
    if (loadErrors.size) {
      log.warn(`[plugins] ✗ ${loadErrors.size} plugin(s) failed to load`);
    }
    return loaded;
  }

  /**
   * loadFile(file) → boolean
   * Loads a single plugin file. Returns true on success.
   * Cache-busting query-string ensures hot-reload gets a fresh module.
   */
  async loadFile(file) {
    const url = pathToFileURL(file).href + '?t=' + Date.now();
    try {
      const mod = await import(url);
      const { meta, handler } = validateMod(mod);

      registerCommand(meta.name, { meta, handler, file });
      this._tracked.add(file);
      loadErrors.delete(file);

      log.plugin(`[plugins] Loaded: ${meta.name} (${path.basename(file)})`);
      return true;
    } catch (e) {
      loadErrors.set(file, e);
      log.error(`[plugins] Failed: ${path.basename(file)} — ${e.message}`);
      return false;
    }
  }

  /**
   * unloadFile(file) → boolean
   * Removes all commands registered by this file.
   * Returns true if anything was removed.
   */
  unloadFile(file) {
    let removed = 0;
    for (const [name, entry] of commands) {
      if (entry.file === file) {
        unregisterCommand(name);
        removed++;
      }
    }
    this._tracked.delete(file);
    loadErrors.delete(file);
    if (removed) log.plugin(`[plugins] Unloaded: ${path.basename(file)}`);
    return removed > 0;
  }

  /**
   * reloadFile(file) → boolean
   * Unloads then reloads a single plugin file.
   */
  async reloadFile(file) {
    this.unloadFile(file);
    return this.loadFile(file);
  }

  /**
   * reloadAll() → number
   * Hot-reloads every currently tracked plugin.
   * Returns count of successfully reloaded plugins.
   */
  async reloadAll() {
    const files = [...this._tracked];
    // Unload all first
    for (const file of files) this.unloadFile(file);
    // Reload all
    let ok = 0;
    for (const file of files) {
      if (await this.loadFile(file)) ok++;
    }
    log.plugin(`[plugins] Reloaded ${ok}/${files.length} plugin(s)`);
    return ok;
  }

  /**
   * getStatus() → object
   * Returns diagnostic info for the health endpoint.
   */
  getStatus() {
    return {
      loaded:    getCommandCount(),
      tracked:   this._tracked.size,
      errors:    loadErrors.size,
      errorList: [...loadErrors.entries()].map(([file, err]) => ({
        file:    path.basename(file),
        message: err.message,
      })),
    };
  }
}

/** Singleton instance — import this everywhere you need plugin operations */
export const pluginManager = new PluginManager();
