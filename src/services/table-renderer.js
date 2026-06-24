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
 *     title     string         — card header / title
 *     columns   string[]       — column names (used as header row / row labels in list)
 *     rows      string[][]     — data rows, parallel to columns
 *     caption   string?        — optional intro text shown above the data
 *     footer    string?        — attribution / source line
 *     style     'auto' | 'interactive' | 'list' | 'carousel'   default: 'auto'
 *     buttons   NativeFlowButton[]?  — action buttons (max 3)
 *     image     {url}|{data}?  — optional hero image (interactive / carousel only)
 *
 * ── Render chain ──────────────────────────────────────────────────────────────
 *
 *   'auto'        → 'interactive' (default, universally readable)
 *
 *   'interactive' → sendInteractive / sendInteractiveWithImage (NativeFlow)
 *                   WA-markdown formatted body, no box drawing
 *                   ↓ on failure
 *                   _fallbackText (plain WA markdown text)
 *
 *   'list'        → sendList (native listMessage, tappable rows)
 *                   Best for selectable/navigable data (≤ ~15 rows)
 *                   ↓ on failure
 *                   interactive path → fallback text
 *
 *   'carousel'    → sendCarousel (multi-card, one card per data row)
 *                   Best for rich per-item data with per-row actions
 *                   ↓ on failure
 *                   interactive path → fallback text
 *
 *   All fallback paths use WA-native markdown formatting.
 *   ASCII boxes, Unicode frames, and box-drawing characters are NEVER used.
 *
 * ── Logging ───────────────────────────────────────────────────────────────────
 *   [TABLE_RENDER] style=interactive columns=2 rows=8 status=success
 *   [TABLE_RENDER] style=list columns=2 rows=4 status=success
 *   [TABLE_RENDER] style=formatted columns=3 rows=5 status=success (fallback)
 *
 * ── Future compatibility ──────────────────────────────────────────────────────
 *   Adding a new style (e.g. 'card', 'poll') only requires adding a new
 *   level here — no changes to callers needed.
 */

import { log } from '../utils/logger.js';
import {
  sendList,
  sendInteractive,
  sendInteractiveWithImage,
  sendCarousel,
} from './rich-messages.js';

// ── Internal helpers ───────────────────────────────────────────────────────────

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
 *   *Name · Stars · Language*
 *   microsoft/vscode · 165k · TypeScript
 *   torvalds/linux · 180k · C
 */
function _buildBody(columns, rows, caption) {
  const lines = [];

  if (caption) lines.push(caption, '');

  if (columns.length === 2) {
    // Key–value: bold key, plain value
    for (const row of rows) {
      const key = String(row[0] ?? '');
      const val = String(row[1] ?? '');
      lines.push(`*${key}*   ${val}`);
    }
  } else {
    // Multi-column: bold header line, then data rows separated by ·
    const sep = ' · ';
    lines.push('*' + columns.join(sep) + '*');
    for (const row of rows) {
      lines.push(row.map(c => String(c ?? '')).join(sep));
    }
  }

  return lines.join('\n');
}

// ── Render levels ──────────────────────────────────────────────────────────────

/**
 * _tryInteractive — primary render path
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
 * _tryList — native listMessage path
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
 * _tryCarousel — multi-card path
 *
 * Each data row becomes an individual card.
 * Best for rich per-item data with per-row actions.
 *
 * Card mapping (per row):
 *   header = columns[0] value   (item name / title)
 *   body   = remaining columns as key: value lines
 *   footer = table-level footer
 *   buttons = per-row buttons from opts.rowButtons[i] (if provided)
 */
async function _tryCarousel(sock, jid, opts, quoted) {
  const { title, columns, rows, footer, rowButtons = [] } = opts;

  const cards = rows.map((row, i) => {
    const bodyLines = [];
    for (let c = 1; c < columns.length; c++) {
      if (row[c] != null) bodyLines.push(`*${columns[c]}*   ${row[c]}`);
    }
    return {
      header:  String(row[0] ?? `Item ${i + 1}`),
      body:    bodyLines.join('\n') || String(row[0] ?? ''),
      footer:  footer ?? '',
      buttons: Array.isArray(rowButtons[i]) ? rowButtons[i] : [],
    };
  });

  await sendCarousel(sock, jid, {
    body:  title ?? '',
    cards,
  }, quoted);
}

/**
 * _fallbackText — formatted WA text (never throws)
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

// ── Logging ────────────────────────────────────────────────────────────────────

function _log(style, columns, rows, status) {
  log.info(
    `[TABLE_RENDER] style=${style} columns=${columns.length} rows=${rows.length} status=${status}`
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * renderTable(ctx, opts) → Promise<void>
 *
 * The single approved output path for all tabular data in Yuzuki AI.
 * Never produces ASCII boxes, Unicode frames, or box-drawing characters.
 *
 * @param {object}  ctx                       — Yuzuki command context
 * @param {object}  opts                      — Table configuration
 * @param {string}  opts.title                — Card header / title
 * @param {string[]}opts.columns              — Column names
 * @param {string[][]}opts.rows               — Data rows (parallel to columns)
 * @param {string}  [opts.caption]            — Intro text above data
 * @param {string}  [opts.footer]             — Attribution / source
 * @param {string}  [opts.style]              — 'auto'|'interactive'|'list'|'carousel'
 * @param {Array}   [opts.buttons]            — Action buttons (max 3)
 * @param {object}  [opts.image]              — Hero image { url } or { data }
 * @param {Array[]} [opts.rowButtons]         — Per-row button arrays (carousel only)
 */
export async function renderTable(ctx, opts) {
  const {
    title,
    columns = [],
    rows    = [],
    caption,
    footer,
    style   = 'auto',
    buttons = [],
    image,
    rowButtons,
  } = opts;

  const { sock, chat: jid, rawMessage: quoted } = ctx;

  if (!rows.length) {
    log.debug('[TABLE_RENDER] renderTable called with no rows — skipping');
    return;
  }

  // 'auto' always resolves to 'interactive' — it is universally readable and
  // doesn't require the user to tap a button before seeing the data (unlike list).
  const effectiveStyle = style === 'auto' ? 'interactive' : style;

  const data = { title, columns, rows, caption, footer, buttons, image, rowButtons };

  // ── Carousel path ──────────────────────────────────────────────────────────
  if (effectiveStyle === 'carousel') {
    try {
      await _tryCarousel(sock, jid, data, quoted);
      _log('carousel', columns, rows, 'success');
      return;
    } catch (e) {
      log.debug(`[TABLE_RENDER] carousel path failed (${e.message}) — interactive fallback`);
    }
    // Fall through to interactive
  }

  // ── List path ──────────────────────────────────────────────────────────────
  if (effectiveStyle === 'list') {
    try {
      await _tryList(sock, jid, data, quoted);
      _log('list', columns, rows, 'success');
      return;
    } catch (e) {
      log.debug(`[TABLE_RENDER] list path failed (${e.message}) — interactive fallback`);
    }
    // Fall through to interactive
  }

  // ── Interactive path (primary for 'interactive' and 'auto') ───────────────
  try {
    await _tryInteractive(sock, jid, data, quoted);
    _log('interactive', columns, rows, 'success');
    return;
  } catch (e) {
    log.debug(`[TABLE_RENDER] interactive path failed (${e.message}) — formatted text`);
  }

  // ── Formatted text fallback (no box drawing, ever) ─────────────────────────
  try {
    await _fallbackText(sock, jid, data, quoted);
    _log('formatted', columns, rows, 'success');
  } catch (e) {
    log.error(`[TABLE_RENDER] All render paths failed: ${e.message}`);
    // Last resort: absolute minimum plain text
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