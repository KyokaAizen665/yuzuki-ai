/**
 * Table Renderer — Yuzuki AI
 *
 * Reusable presentation layer for structured data.
 * Replaces the legacy sendTable() ASCII/box-drawing function across
 * all commands and services that need to display tabular data.
 *
 * ── Designed for ─────────────────────────────────────────────────────────────
 *   - Bot statistics (info command)
 *   - Channel metadata (channel command)
 *   - AI response tables (via sendAIRichResponse)
 *   - Search result grids (search, github commands)
 *   - Downloader metadata cards
 *   - Any future command needing structured data display
 *
 * ── API ───────────────────────────────────────────────────────────────────────
 *
 *   renderTable(ctx, opts) → Promise<void>
 *
 *   opts:
 *     title      string           — card header / title
 *     columns    string[]         — column names (used as header row / row labels in list)
 *     rows       string[][]       — data rows, parallel to columns
 *     caption    string?          — optional intro text shown above the data
 *     footer     string?          — attribution / source line
 *     style      'auto' | 'interactive' | 'list' | 'carousel'   default: 'auto'
 *     buttons    NativeFlowButton[]?  — action buttons (max 3, interactive/carousel only)
 *     image      {url}|{data}?    — optional hero image (interactive only)
 *     rowButtons Array[]?         — per-row button arrays (carousel 'items' variant only)
 *
 * ── Auto-selection logic ──────────────────────────────────────────────────────
 *
 *   style='auto' picks a renderer based on dataset shape:
 *
 *   Shape                         → Renderer chosen
 *   ──────────────────────────────────────────────────
 *   2 columns (key/value)         → interactive       (immediately readable)
 *   3+ cols, numeric metrics,
 *     single data row             → carousel-metrics  (one card per metric column)
 *   3+ cols, numeric metrics,
 *     multi data rows             → carousel-items    (one card per row)
 *   3+ cols, non-numeric          → interactive       (header · col · col text layout)
 *   Any, when carousel fails      → interactive       (fallback)
 *   Any, when interactive fails   → formatted text    (plain WA markdown)
 *
 *   Callers can override by passing style:'carousel'|'interactive'|'list' explicitly.
 *
 * ── Render chain ──────────────────────────────────────────────────────────────
 *
 *   'interactive' → sendInteractive / sendInteractiveWithImage (NativeFlow)
 *                   WA-markdown formatted body, no box drawing
 *                   ↓ on failure
 *                   _fallbackText (plain WA markdown text)
 *
 *   'list'        → sendList (native listMessage, tappable rows)
 *                   Best for selectable/navigable data (≤ ~15 rows, 2 cols)
 *                   ↓ on failure
 *                   interactive path → fallback text
 *
 *   'carousel'    → _tryCarouselMetrics or _tryCarouselItems (sendCarousel)
 *                   ↓ on failure
 *                   interactive path → fallback text
 *
 *   All fallback paths use WA-native markdown formatting.
 *   ASCII boxes, Unicode frames, and box-drawing characters are NEVER used.
 *
 * ── Logging ───────────────────────────────────────────────────────────────────
 *   [TABLE_RENDER] style=interactive columns=2 rows=8 status=success
 *   [TABLE_RENDER] style=carousel-metrics columns=3 rows=1 status=success
 *   [TABLE_RENDER] style=carousel-items columns=3 rows=5 status=success
 *   [TABLE_RENDER] style=list columns=2 rows=4 status=success
 *   [TABLE_RENDER] style=formatted columns=3 rows=5 status=success (fallback)
 */

import { log } from '../utils/logger.js';
import {
  sendList,
  sendInteractive,
  sendInteractiveWithImage,
  sendCarousel,
} from './rich-messages.js';

// ── Dataset shape detection ─────────────────────────────────────────────────

/**
 * _isNumericCell(v) — true when the string looks like a measurement / count.
 *
 * Matches: integers, floats, comma-formatted numbers, percentages, values
 * suffixed with k/K/m/M/b/B/g/G (abbreviations), negative values.
 * Single char cells ("—", "✅", "ES") are treated as NOT numeric.
 */
function _isNumericCell(v) {
  const s = String(v ?? '').trim();
  if (s.length <= 1) return false;
  return /^[+\-]?[\d][\d,._\s]*[kKmMbBgGtT%]?$/.test(s)
      || /^[\d,._]+\s*[kKmMbBgGtT%]$/.test(s);
}

/**
 * _isStatsDataset(columns, rows) — heuristics for "statistics-style" data.
 *
 * Returns true when:
 *   - 3 or more columns, AND
 *   - at least 50% of cells in columns[1..n] look numeric.
 *
 * This distinguishes a metrics table (views, likes, comments)
 * from a key/value pair list or a freeform results table.
 */
function _isStatsDataset(columns, rows) {
  if (columns.length < 3 || !rows.length) return false;

  let numeric = 0;
  let total   = 0;

  for (const row of rows) {
    for (let c = 1; c < columns.length; c++) {
      total++;
      if (_isNumericCell(row[c])) numeric++;
    }
  }

  return total > 0 && (numeric / total) >= 0.5;
}

// ── Internal body builder ───────────────────────────────────────────────────

/**
 * _buildBody(columns, rows, caption) → string
 *
 * Builds a WhatsApp-markdown formatted body for the interactive path.
 * No box drawing. No ASCII art. WA-native only.
 *
 * 2-column (key-value):
 *   *🤖 Bot*      Yuzuki AI v2.0.0
 *   *⏱ Uptime*   2h 34m
 *   *🧠 Memory*  89MB / 142MB RSS
 *
 * Multi-column:
 *   *👁 Views · ❤️ Likes · 💬 Comments*
 *   11,022 · 986 · 30
 */
function _buildBody(columns, rows, caption) {
  const lines = [];

  if (caption) lines.push(caption, '');

  if (columns.length === 2) {
    for (const row of rows) {
      const key = String(row[0] ?? '');
      const val = String(row[1] ?? '');
      lines.push(`*${key}*   ${val}`);
    }
  } else {
    const sep = ' · ';
    lines.push('*' + columns.join(sep) + '*');
    for (const row of rows) {
      lines.push(row.map(c => String(c ?? '')).join(sep));
    }
  }

  return lines.join('\n');
}

// ── Render levels ───────────────────────────────────────────────────────────

/**
 * _tryInteractive — primary non-carousel render path.
 *
 * NativeFlow interactive message: header, formatted body, footer, buttons.
 * Adds hero image header when opts.image is provided.
 */
async function _tryInteractive(sock, jid, opts, quoted) {
  const { title, columns, rows, caption, footer, buttons = [], image } = opts;
  const body = _buildBody(columns, rows, caption).slice(0, 1024);
  const btns = buttons.slice(0, 3);

  if (image) {
    await sendInteractiveWithImage(sock, jid, {
      header:  title ?? '',
      image,
      body,
      footer:  footer ?? '',
      buttons: btns,
    }, quoted);
  } else {
    await sendInteractive(sock, jid, {
      header:  title ?? '',
      body,
      footer:  footer ?? '',
      buttons: btns,
    }, quoted);
  }
}

/**
 * _tryList — native listMessage path.
 *
 * WhatsApp native single-select list. Each row becomes a tappable item:
 *   title       = column 0 value (the "key")
 *   description = column 1 value (the "value")
 *
 * Best for selectable/navigable data with 2 columns, ≤ ~15 rows.
 * Requires user to tap the button to open the list — not ideal for read-only
 * stats. Use 'interactive' style for data users should read immediately.
 */
async function _tryList(sock, jid, opts, quoted) {
  const { title, columns, rows, caption, footer } = opts;
  const sections = [{
    title: title ?? columns[0] ?? '',
    rows:  rows.map((row, i) => ({
      id:          `tbl_${i}`,
      title:       String(row[0] ?? ''),
      description: columns.length >= 2 ? String(row[1] ?? '') : '',
    })),
  }];

  await sendList(sock, jid, {
    title:       title ?? columns[0] ?? 'Data',
    description: caption ?? '',
    buttonText:  'View',
    footer:      footer ?? '',
    sections,
  }, quoted);
}

/**
 * _tryCarouselMetrics — stats carousel variant.
 *
 * Used when the dataset has a SINGLE data row with 3+ metric columns.
 * Each column becomes its own card so every metric is immediately visible:
 *
 *   columns = ['👁 Views', '❤️ Likes', '💬 Comments']
 *   rows    = [['11,022',   '986',      '30']]
 *
 *   Card 1: header="👁 Views"    body="11,022"
 *   Card 2: header="❤️ Likes"   body="986"
 *   Card 3: header="💬 Comments" body="30"
 *
 * For multi-row stats, falls back to _tryCarouselItems instead.
 */
async function _tryCarouselMetrics(sock, jid, opts, quoted) {
  const { title, columns, rows, footer, buttons = [] } = opts;

  const dataRow = rows[0];
  const cards = columns.map((col, c) => ({
    header:  col,
    body:    String(dataRow[c] ?? '—'),
    footer:  footer ?? '',
    buttons: buttons.slice(0, 2),
  }));

  await sendCarousel(sock, jid, {
    body:  title ?? '',
    cards,
  }, quoted);
}

/**
 * _tryCarouselItems — item-per-row carousel variant.
 *
 * Used when the dataset has MULTIPLE data rows with 3+ columns.
 * Each row becomes one card:
 *
 *   columns = ['Name',    'Stars', 'Language']
 *   rows    = [['vscode', '165k',  'TypeScript'],
 *              ['linux',  '180k',  'C']]
 *
 *   Card 1: header="vscode"  body="Stars   165k\nLanguage   TypeScript"
 *   Card 2: header="linux"   body="Stars   180k\nLanguage   C"
 *
 * rowButtons (optional): Array of button arrays, one per row.
 */
async function _tryCarouselItems(sock, jid, opts, quoted) {
  const { title, columns, rows, footer, rowButtons = [], buttons = [] } = opts;

  const cards = rows.map((row, i) => {
    const bodyLines = [];
    for (let c = 1; c < columns.length; c++) {
      if (row[c] != null) bodyLines.push(`*${columns[c]}*   ${row[c]}`);
    }
    return {
      header:  String(row[0] ?? `Item ${i + 1}`),
      body:    bodyLines.join('\n') || String(row[0] ?? ''),
      footer:  footer ?? '',
      buttons: Array.isArray(rowButtons[i])
        ? rowButtons[i]
        : buttons.slice(0, 2),
    };
  });

  await sendCarousel(sock, jid, {
    body:  title ?? '',
    cards,
  }, quoted);
}

/**
 * _fallbackText — formatted WA text (never throws).
 *
 * Last resort: WA-markdown key:value layout.
 * NO box drawing, NO Unicode frames, NO ASCII art.
 */
async function _fallbackText(sock, jid, opts, quoted) {
  const { title, columns, rows, caption, footer } = opts;

  const parts = [];
  if (title)   parts.push(`*${title}*`);
  if (caption) parts.push(caption);
  parts.push(_buildBody(columns, rows));
  if (footer)  parts.push(`\n_${footer}_`);

  const text = parts.filter(Boolean).join('\n');
  await sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
}

// ── Logging ─────────────────────────────────────────────────────────────────

function _log(style, columns, rows, status) {
  log.info(
    `[TABLE_RENDER] style=${style} columns=${columns.length} rows=${rows.length} status=${status}`
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * renderTable(ctx, opts) → Promise<void>
 *
 * The single approved output path for all tabular data in Yuzuki AI.
 * Never produces ASCII boxes, Unicode frames, or box-drawing characters.
 *
 * @param {object}   ctx                — Yuzuki command context
 * @param {object}   opts               — Table configuration
 * @param {string}   opts.title         — Card header / title
 * @param {string[]} opts.columns       — Column names
 * @param {string[][]}opts.rows         — Data rows (parallel to columns)
 * @param {string}   [opts.caption]     — Intro text above data
 * @param {string}   [opts.footer]      — Attribution / source
 * @param {string}   [opts.style]       — 'auto'|'interactive'|'list'|'carousel'
 *                                        'auto' detects the best renderer from
 *                                        dataset shape — see module header.
 * @param {Array}    [opts.buttons]     — Action buttons (max 3)
 * @param {object}   [opts.image]       — Hero image { url } or { data }
 *                                        Only used by the interactive path.
 * @param {Array[]}  [opts.rowButtons]  — Per-row button arrays
 *                                        Only used by carousel-items path.
 */
export async function renderTable(ctx, opts) {
  const {
    title,
    columns    = [],
    rows       = [],
    caption,
    footer,
    style      = 'auto',
    buttons    = [],
    image,
    rowButtons,
  } = opts;

  const { sock, chat: jid, rawMessage: quoted } = ctx;

  if (!rows.length) {
    log.debug('[TABLE_RENDER] renderTable called with no rows — skipping');
    return;
  }

  // ── Auto-select renderer from dataset shape ─────────────────────────────
  //
  // Rules (evaluated in order — first match wins):
  //  1. Explicit style override from caller → honor it.
  //  2. 2 columns → interactive (key/value, always readable on first glance).
  //  3. 3+ columns, stats-shaped (≥50% numeric cells in cols 1..n):
  //       single data row → carousel-metrics (one card per column / metric)
  //       multi data rows → carousel-items   (one card per row / item)
  //  4. 3+ columns, non-numeric  → interactive.
  //
  // Carousel is OPTIONAL — any carousel failure falls through to interactive,
  // which always falls through to plain WA-markdown text. Callers never need
  // to handle renderer errors.

  let effectiveStyle = style;

  if (style === 'auto') {
    if (columns.length >= 3 && _isStatsDataset(columns, rows)) {
      effectiveStyle = rows.length === 1 ? 'carousel-metrics' : 'carousel-items';
    } else {
      effectiveStyle = 'interactive';
    }
  }

  // Normalize the explicit 'carousel' override: pick variant based on row count.
  if (style === 'carousel') {
    effectiveStyle = rows.length === 1 ? 'carousel-metrics' : 'carousel-items';
  }

  const data = { title, columns, rows, caption, footer, buttons, image, rowButtons };

  // ── Carousel-metrics path (stats, single row) ──────────────────────────
  if (effectiveStyle === 'carousel-metrics') {
    try {
      await _tryCarouselMetrics(sock, jid, data, quoted);
      _log('carousel-metrics', columns, rows, 'success');
      return;
    } catch (e) {
      log.debug(`[TABLE_RENDER] carousel-metrics failed (${e.message}) — interactive fallback`);
    }
    // Fall through to interactive
    effectiveStyle = 'interactive';
  }

  // ── Carousel-items path (stats, multi-row) ─────────────────────────────
  if (effectiveStyle === 'carousel-items') {
    try {
      await _tryCarouselItems(sock, jid, data, quoted);
      _log('carousel-items', columns, rows, 'success');
      return;
    } catch (e) {
      log.debug(`[TABLE_RENDER] carousel-items failed (${e.message}) — interactive fallback`);
    }
    effectiveStyle = 'interactive';
  }

  // ── List path ──────────────────────────────────────────────────────────
  if (effectiveStyle === 'list') {
    try {
      await _tryList(sock, jid, data, quoted);
      _log('list', columns, rows, 'success');
      return;
    } catch (e) {
      log.debug(`[TABLE_RENDER] list failed (${e.message}) — interactive fallback`);
    }
    effectiveStyle = 'interactive';
  }

  // ── Interactive path (primary for 2-col, non-stats, and all fallbacks) ─
  if (effectiveStyle === 'interactive') {
    try {
      await _tryInteractive(sock, jid, data, quoted);
      _log('interactive', columns, rows, 'success');
      return;
    } catch (e) {
      log.debug(`[TABLE_RENDER] interactive failed (${e.message}) — formatted text`);
    }
  }

  // ── Formatted text fallback (no box drawing, ever) ─────────────────────
  try {
    await _fallbackText(sock, jid, data, quoted);
    _log('formatted', columns, rows, 'success');
  } catch (e) {
    log.error(`[TABLE_RENDER] All render paths failed: ${e.message}`);
    try {
      const plain = [
        title ?? '',
        ...rows.map(r => r.filter(Boolean).join(' | ')),
      ].filter(Boolean).join('\n');
      await sock.sendMessage(jid, { text: plain }, quoted ? { quoted } : {});
    } catch { /* nothing more can be done */ }
    _log('plaintext', columns, rows, 'last-resort');
  }
}