/**
 * Hero Image Service — Yuzuki AI (Phase 4)
 *
 * Centralised management for hero images used in interactive command cards.
 * Removes all hardcoded image URLs from individual command files.
 *
 * ── Supported categories ──────────────────────────────────────────────────────
 *   menu       — main help / menu card
 *   ai         — AI command cards
 *   owner      — owner / support card
 *   channel    — channel command card
 *   downloader — downloader command cards
 *
 * ── Resolution priority ───────────────────────────────────────────────────────
 *   1. Local image file   assets/hero/<category>/<file>   (random pick)
 *   2. Env var URL        HERO_IMAGE_<CATEGORY>_URL
 *   3. Default fallback URL per category (always produces a valid image)
 *
 * ── Return format ─────────────────────────────────────────────────────────────
 *   { data: Buffer }   when a local file is used
 *   { url: string  }   when a URL is used
 *
 *   Both forms are compatible with cv3inx sock.sendMessage({ image: ... }).
 *
 * ── Adding images ─────────────────────────────────────────────────────────────
 *   Drop any .jpg / .jpeg / .png / .webp / .gif file into
 *   assets/hero/<category>/ and restart the bot.
 *   Multiple images in the same folder rotate randomly across invocations.
 *
 * ── Env var overrides ─────────────────────────────────────────────────────────
 *   HERO_IMAGE_MENU_URL
 *   HERO_IMAGE_AI_URL
 *   HERO_IMAGE_OWNER_URL
 *   HERO_IMAGE_CHANNEL_URL
 *   HERO_IMAGE_DOWNLOADER_URL
 *
 *   Set the appropriate variable to a direct image URL (HTTP 200, no redirect)
 *   to override the default fallback for that category without adding local files.
 *
 * Never throws — falls back gracefully through every level.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath }          from 'url';
import { log }                    from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/** Root directory for all hero image assets. */
const ASSET_ROOT = join(__dirname, '../../assets/hero');

/** Accepted image file extensions. */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// ── Per-category configuration ────────────────────────────────────────────────

/**
 * Environment variable names for URL overrides per category.
 * These are checked when no local image files are present.
 */
const CATEGORY_ENV = {
  menu:       'HERO_IMAGE_MENU_URL',
  ai:         'HERO_IMAGE_AI_URL',
  owner:      'HERO_IMAGE_OWNER_URL',
  channel:    'HERO_IMAGE_CHANNEL_URL',
  downloader: 'HERO_IMAGE_DOWNLOADER_URL',
};

/**
 * Default fallback URLs.
 *
 * These are used when neither local files nor env vars are configured.
 * All are direct HTTP 200 responses with no redirect or auth requirement.
 *
 * Replace with project-specific CDN or GitHub raw URLs before going live
 * so every category has a branded hero image.
 */
const DEFAULT_FALLBACKS = {
  menu:       'https://picsum.photos/id/1/720/400.jpg',
  ai:         'https://picsum.photos/id/20/720/400.jpg',
  owner:      'https://picsum.photos/id/42/720/400.jpg',
  channel:    'https://picsum.photos/id/65/720/400.jpg',
  downloader: 'https://picsum.photos/id/96/720/400.jpg',
};

/** Global fallback used when the category is unknown. */
const GLOBAL_FALLBACK = DEFAULT_FALLBACKS.menu;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * listLocalImages(category) → string[]
 *
 * Returns the full paths of all accepted image files in
 * assets/hero/<category>/. Returns [] if the directory does not exist
 * or cannot be read.
 */
function listLocalImages(category) {
  const dir = join(ASSET_ROOT, category);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
      .map(f => join(dir, f));
  } catch (e) {
    log.warn(`[hero] Cannot read asset dir for "${category}": ${e.message}`);
    return [];
  }
}

/**
 * pickRandom(arr) → arr[i]
 *
 * Uniformly picks one element. Safe to call with a length-1 array
 * (returns the only element, no randomness needed).
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getRandomHeroImage(category?) → { url: string } | { data: Buffer }
 *
 * Resolves a hero image for the given category.
 *
 * @param {string} [category='menu'] — one of: menu, ai, owner, channel, downloader
 * @returns {{ url: string } | { data: Buffer }}
 *
 * @example
 *   // In help.js — full menu card
 *   image: getRandomHeroImage('menu')
 *
 *   // In owner.js
 *   image: getRandomHeroImage('owner')
 */
export function getRandomHeroImage(category = 'menu') {
  const cat = (category ?? 'menu').toLowerCase().trim();

  // ── 1. Local image files ─────────────────────────────────────────────────
  const locals = listLocalImages(cat);
  if (locals.length > 0) {
    const chosen = pickRandom(locals);
    try {
      const data = readFileSync(chosen);
      // Log only the last two path segments to avoid exposing full server path
      const shortPath = chosen.split(/[/\\]/).slice(-2).join('/');
      log.debug(`[hero] ${cat} → local (${locals.length} available): ${shortPath}`);
      return { data };
    } catch (e) {
      log.warn(`[hero] Failed to read "${chosen}": ${e.message} — falling back to URL`);
    }
  }

  // ── 2. Env var URL override ──────────────────────────────────────────────
  const envKey = CATEGORY_ENV[cat];
  if (envKey) {
    const envUrl = (process.env[envKey] ?? '').trim();
    if (envUrl) {
      log.debug(`[hero] ${cat} → env var ${envKey}`);
      return { url: envUrl };
    }
  }

  // ── 3. Default fallback URL ──────────────────────────────────────────────
  const fallbackUrl = DEFAULT_FALLBACKS[cat] ?? GLOBAL_FALLBACK;
  log.debug(`[hero] ${cat} → default fallback`);
  return { url: fallbackUrl };
}

/**
 * getCategoryList() → string[]
 *
 * Returns all known category names. Useful for tooling / admin commands.
 */
export function getCategoryList() {
  return Object.keys(CATEGORY_ENV);
}

/**
 * getHeroStats() → object
 *
 * Returns a diagnostic snapshot: local image counts per category and
 * which resolution path would be used for each.
 * Designed for use in admin/debug commands.
 *
 * @returns {{ [category: string]: { localCount: number, source: 'local'|'env'|'default' } }}
 */
export function getHeroStats() {
  return Object.fromEntries(
    Object.keys(CATEGORY_ENV).map(cat => {
      const locals = listLocalImages(cat);
      const envKey = CATEGORY_ENV[cat];
      const hasEnv = !!(process.env[envKey] ?? '').trim();
      const source = locals.length > 0 ? 'local' : hasEnv ? 'env' : 'default';
      return [cat, { localCount: locals.length, source }];
    })
  );
}
