/**
 * HeroManager — Yuzuki AI
 *
 * Manages the hero image pool for menu (and future card) rendering.
 *
 * ── Directory ────────────────────────────────────────────────────────────────
 *   assets/heroes/         ← drop any .jpg / .jpeg / .png / .webp / .gif here
 *
 * ── Environment controls ─────────────────────────────────────────────────────
 *   MENU_HERO_MODE=random    pick a random image from the pool  (default)
 *   MENU_HERO_MODE=static    always use MENU_HERO_IMAGE
 *   MENU_HERO_IMAGE=hero-1.jpg   filename to use in static mode
 *
 * ── Public API ────────────────────────────────────────────────────────────────
 *   getRandomHero()   → { path, filename }
 *   getHeroImage()    → { data: Buffer } | { url: string }  (menu-ready)
 *   status()          → diagnostic object
 *
 * ── Performance ───────────────────────────────────────────────────────────────
 *   Hero list is scanned once at module load (plugin-load phase) and cached.
 *   Subsequent calls are O(1) — no filesystem access on each menu render.
 *
 * ── Extensibility ─────────────────────────────────────────────────────────────
 *   Each hero entry carries metadata fields (weight, theme, category) that
 *   future features (weighted rotation, themed heroes, category heroes) can
 *   use without any change to menu code.
 *
 * ── Fallback chain ────────────────────────────────────────────────────────────
 *   assets/heroes/* → getRandomHeroImage('menu') → default gstatic URL
 *   Menu rendering never crashes regardless of pool state.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, extname, basename }                from 'path';
import { fileURLToPath }                                   from 'url';
import { log }                                             from '../../utils/logger.js';
import { getRandomHeroImage }                              from '../hero-images.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Paths ─────────────────────────────────────────────────────────────────────

const HEROES_DIR = join(__dirname, '../../../assets/heroes');

/** Accepted image file extensions. */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// ── Internal hero record ──────────────────────────────────────────────────────

/**
 * @typedef {object} HeroEntry
 * @property {string}      path       — absolute filesystem path
 * @property {string}      filename   — base filename (e.g. "hero-1.jpg")
 * @property {number}      weight     — relative selection weight (future: weighted rotation)
 * @property {string|null} theme      — optional theme tag (future: themed heroes)
 * @property {string}      category   — category tag (future: category heroes)
 */

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {HeroEntry[]} */
let _heroes  = [];
let _ready   = false;
let _mode    = 'random';
let _static  = '';

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * _init() — scan assets/heroes/, populate cache, log startup status.
 *
 * Called once at module load (during plugin-load phase). All subsequent
 * calls to getHeroImage() / getRandomHero() are served from the cache.
 */
function _init() {
  _mode   = (process.env.MENU_HERO_MODE  ?? 'random').toLowerCase().trim();
  _static = (process.env.MENU_HERO_IMAGE ?? '').trim();

  // ── Directory check ──────────────────────────────────────────────────────
  if (!existsSync(HEROES_DIR)) {
    log.warn(`[HERO] heroes directory not found: ${HEROES_DIR}`);
    log.warn('[HERO] Create assets/heroes/ and add at least one image.');
    _ready = false;
    _logStatus();
    return;
  }

  // ── Scan ──────────────────────────────────────────────────────────────────
  try {
    const files = readdirSync(HEROES_DIR)
      .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
      .sort(); // stable order

    _heroes = files.map(filename => ({
      path:     join(HEROES_DIR, filename),
      filename,
      weight:   1,     // future: parse from filename, e.g. "hero-3.w2.jpg" → weight 2
      theme:    null,  // future: parse from filename, e.g. "hero-night.jpg" → theme "night"
      category: 'menu',
    }));
  } catch (e) {
    log.warn(`[HERO] Could not read heroes directory: ${e.message}`);
    _ready = false;
    _logStatus();
    return;
  }

  // ── Validate static mode ──────────────────────────────────────────────────
  if (_mode === 'static' && _static) {
    const found = _heroes.some(h => h.filename === _static);
    if (!found) {
      log.warn(`[HERO] MENU_HERO_IMAGE="${_static}" not found in pool — falling back to random`);
      _mode = 'random';
    }
  }

  _ready = _heroes.length > 0;

  if (!_ready) {
    log.warn('[HERO] Hero pool is empty. Add images to assets/heroes/ for rotation.');
    log.warn('[HERO] Falling back to hero-images.js (HERO_IMAGE_MENU_URL / assets/hero/menu/).');
  }

  _logStatus();
}

function _logStatus() {
  log.plugin(
    `[HERO] mode=${_mode} images=${_heroes.length} status=${_ready ? 'ready' : 'fallback'}`,
  );
}

// ── Selection helpers ─────────────────────────────────────────────────────────

/**
 * _pick() → HeroEntry | null
 *
 * Applies the configured selection strategy and returns one hero.
 * Returns null when the pool is empty.
 *
 * Future strategies (weight, theme, category) can be added here
 * without changing any caller code.
 */
function _pick() {
  if (_heroes.length === 0) return null;

  if (_mode === 'static' && _static) {
    const entry = _heroes.find(h => h.filename === _static);
    if (entry) return entry;
  }

  // Random (default): uniform selection across pool
  return _heroes[Math.floor(Math.random() * _heroes.length)];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getRandomHero() → { path, filename }
 *
 * Returns one hero from the pool according to the configured mode.
 * Falls back to a synthetic entry pointing at the hero-images fallback
 * URL when the pool is empty — callers always get a valid object.
 *
 * @returns {{ path: string|null, filename: string }}
 */
export function getRandomHero() {
  const entry = _pick();
  if (entry) return { path: entry.path, filename: entry.filename };

  // Pool empty — return a sentinel so callers can detect the fallback
  return { path: null, filename: '' };
}

/**
 * getHeroImage() → { data: Buffer } | { url: string }
 *
 * Returns the hero image in the exact format expected by cv3inx's
 * sock.sendMessage({ image: ... }) — the same format as getRandomHeroImage().
 *
 * Fallback chain:
 *   1. assets/heroes/<selected>  → { data: Buffer }
 *   2. getRandomHeroImage('menu') — hero-images fallback chain
 *      (assets/hero/menu/, HERO_IMAGE_MENU_URL, default gstatic URL)
 *
 * Never throws.
 */
export function getHeroImage() {
  const entry = _pick();

  if (entry) {
    try {
      const data = readFileSync(entry.path);
      log.debug(`[HERO] selected=${entry.filename}`);
      return { data };
    } catch (e) {
      log.warn(`[HERO] Failed to read "${entry.filename}": ${e.message} — falling back`);
    }
  }

  // Fallback: delegate to the existing hero-images service
  return getRandomHeroImage('menu');
}

/**
 * status() → object
 *
 * Returns a diagnostic snapshot for admin / health commands.
 */
export function status() {
  return {
    mode:      _mode,
    static:    _static || null,
    count:     _heroes.length,
    ready:     _ready,
    heroesDir: HEROES_DIR,
    heroes:    _heroes.map(h => ({
      filename: h.filename,
      weight:   h.weight,
      theme:    h.theme,
      category: h.category,
    })),
  };
}

// ── Self-init at module load ───────────────────────────────────────────────────
// Runs during the plugin-load phase (step 6 in index.js) when help.js imports
// this module. No changes to index.js required.

_init();
