/**
 * Button Response Router — Yuzuki AI (Phase 3 — suggest_* fix)
 *
 * PATCH CHANGES vs Phase 2.5:
 *   • suggest_* buttons now route as `.ai <display_text>` instead of being
 *     silently dropped. The display_text from the button params object is
 *     the original prompt string (e.g. "Explain this code").
 *   • resolveBody() updated to accept an optional displayText argument so
 *     suggest routing can use the human-readable label.
 *   • All other routing logic unchanged.
 *
 * Extraction priority (unchanged from Phase 2.5):
 *   1. ctx.body
 *   2. ctx.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
 *   3. ctx.message.nativeFlowResponseMessage.paramsJson
 *   4. ctx.message.buttonsResponseMessage.selectedButtonId
 *
 * Button ID conventions:
 *   cmd_<name>        → run: .<name>
 *   use_<name>        → run: .<name>
 *   help_<name>       → run: .help <name>
 *   open_menu         → run: .help
 *   back_menu         → run: .help
 *   follow_official   → run: .channel follow <officialChannelJid>
 *   ch_follow         → run: .channel follow
 *   ch_unfollow       → run: .channel unfollow
 *   ch_mute           → run: .channel mute
 *   ch_unmute         → run: .channel unmute
 *   ai_*              → AI card shortcuts (ai_clear, ai_status, ai_personality)
 *   suggest_*         → FIXED: run: .ai <display_text>   ← was silently dropped
 */

import { log }          from '../utils/logger.js';
import { config }       from '../config/index.js';
import { routeCommand } from './command.js';

// ── Static button ID → synthetic body resolver ───────────────────────────────

const STATIC_ROUTES = {
  open_menu:       () => `${config.prefix}help`,
  back_menu:       () => `${config.prefix}help`,
  follow_official: () => config.officialChannelJid
    ? `${config.prefix}channel follow ${config.officialChannelJid}`
    : `${config.prefix}channel`,
  ch_follow:       () => `${config.prefix}channel follow`,
  ch_unfollow:     () => `${config.prefix}channel unfollow`,
  ch_mute:         () => `${config.prefix}channel mute`,
  ch_unmute:       () => `${config.prefix}channel unmute`,
  // AI card buttons (from the .ai no-args interactive card)
  ai_clear:        () => `${config.prefix}ai clear`,
  ai_status:       () => `${config.prefix}ai status`,
  ai_personality:  () => `${config.prefix}ai personality`,
  // Downloader shortcuts
  use_yt:          () => `${config.prefix}dl help`,
  use_tt:          () => `${config.prefix}dl help`,
  // Search shortcuts
  search_web:      () => `${config.prefix}search`,
  search_wiki:     () => `${config.prefix}search wiki`,
  search_yt:       () => `${config.prefix}search yt`,
  // GitHub shortcuts
  gh_trending:     () => `${config.prefix}gh trending`,
  gh_search:       () => `${config.prefix}gh search`,
};

/**
 * resolveBody(id, displayText?) → string | null
 *
 * Maps a button ID to the synthetic command body to execute.
 * displayText is the human-readable label from buttonParamsJson and is
 * used for suggest_* routing so the original prompt text is preserved.
 */
function resolveBody(id, displayText) {
  if (!id) return null;

  // Static routes (exact ID match)
  if (STATIC_ROUTES[id]) return STATIC_ROUTES[id]();

  // Prefix-based routes
  if (id.startsWith('cmd_')) return `${config.prefix}${id.slice(4).trim()}` || null;
  if (id.startsWith('use_')) return `${config.prefix}${id.slice(4).trim()}` || null;
  if (id.startsWith('help_')) {
    const name = id.slice(5).trim();
    return name ? `${config.prefix}help ${name}` : `${config.prefix}help`;
  }

  // Lab test buttons — lab_<testname> → .lab <testname>
  if (id.startsWith('lab_')) {
    const test = id.slice(4).trim();
    return test ? `${config.prefix}lab ${test}` : `${config.prefix}lab`;
  }

  // ── PHASE 3 FIX: suggest_* → route as .ai <display_text> ─────────────────
  //
  // Before this fix, suggest_* returned null and the tap was silently dropped.
  // Now we route it as a full .ai chat call using the display_text from the
  // button params (e.g. "Explain this code", "Continue", "Simplify", etc.).
  //
  // Fallback: if display_text is missing or equals the raw id string, use the
  // human-readable part after "suggest_" as a best-effort prompt.
  // Direct command IDs — if the id is itself a command (starts with the
  // configured prefix, e.g. ".allmenu", ".ai", ".dl"), run it as-is.
  // This lets quick-reply buttons use the exact command string as their id
  // without needing a named route entry here.
  if (id.startsWith(config.prefix)) return id;

  if (id.startsWith('suggest_')) {
    const prompt = displayText?.trim();
    if (prompt && prompt !== id) {
      return `${config.prefix}ai ${prompt}`;
    }
    // display_text not useful — best effort from id suffix (suggest_0 → not helpful)
    log.debug(`[button] suggest button has no usable display_text (id=${id}) — ignoring`);
    return null;
  }

  log.warn(`[button] no route for button id: ${id}`);
  return null;
}

// ── Multi-source parameter extraction ────────────────────────────────────────

function tryParseJson(str) {
  if (!str || typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * extractParams(ctx) → { id, display_text?, ... } | null
 */
function extractParams(ctx) {
  const msg = ctx.message ?? ctx.rawMessage?.message;

  // ── Source 1: ctx.body (serializer fast path) ──────────────────────────
  if (ctx.body?.trim()) {
    const p = tryParseJson(ctx.body);
    if (p?.id) {
      log.debug(`[button] params via ctx.body`);
      return p;
    }
    log.debug(`[button] ctx.body present but no id: ${ctx.body.slice(0, 80)}`);
  }

  // ── Source 2: interactiveResponseMessage.nativeFlowResponseMessage ─────
  const irm = msg?.interactiveResponseMessage;
  if (irm) {
    const p = tryParseJson(irm.nativeFlowResponseMessage?.paramsJson);
    if (p?.id) {
      log.debug(`[button] params via interactiveResponseMessage.nativeFlowResponseMessage`);
      return p;
    }
    // Fallback: some WA clients omit paramsJson and only set body.text (the button display text).
    // Use body.text as the id so resolveBody can route it (works when display text starts with
    // the command prefix, which is guaranteed by the menu button display texts we send).
    if (irm.body?.text?.trim()) {
      const bodyText = irm.body.text.trim();
      log.debug(`[button] paramsJson absent — using irm.body.text as id: "${bodyText.slice(0, 40)}"`);
      return { id: bodyText, display_text: bodyText };
    }
  }

  // ── Source 3: nativeFlowResponseMessage at top level ───────────────────
  const nfrm = msg?.nativeFlowResponseMessage;
  if (nfrm) {
    const p = tryParseJson(nfrm.paramsJson);
    if (p?.id) {
      log.debug(`[button] params via top-level nativeFlowResponseMessage`);
      return p;
    }
  }

  // ── Source 4: legacy buttonsResponseMessage ────────────────────────────
  const brm = msg?.buttonsResponseMessage;
  if (brm?.selectedButtonId) {
    log.debug(`[button] params via buttonsResponseMessage.selectedButtonId`);
    return { id: brm.selectedButtonId, display_text: brm.selectedDisplayText ?? brm.selectedButtonId };
  }

  log.warn(
    `[button] no params found — contentType=${ctx.contentType}` +
    ` body=${JSON.stringify(ctx.body?.slice(0, 80) ?? null)}` +
    ` msgKeys=${msg ? JSON.stringify(Object.keys(msg)) : 'null'}` +
    ` irm=${irm ? JSON.stringify(Object.keys(irm)) : 'null'}` +
    ` nfrm=${nfrm ? JSON.stringify(Object.keys(nfrm)) : 'null'}`
  );
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function routeButtonResponse(sock, ctx) {
  try {
    log.debug(
      `[button] incoming — contentType=${ctx.contentType}` +
      ` from=${ctx.sender} fromMe=${ctx.fromMe}` +
      ` body=${JSON.stringify(ctx.body?.slice(0, 100) ?? null)}`
    );

    const params = extractParams(ctx);
    if (!params) return false;

    const { id, display_text: displayText = id } = params;
    if (!id) {
      log.debug(`[button] empty id after extraction`);
      return false;
    }

    log.event(`[button] ${ctx.sender} tapped "${displayText}" (id=${id})`);

    // Pass displayText to resolveBody — needed for suggest_* routing
    const syntheticBody = resolveBody(id, displayText);
    if (!syntheticBody) return false;

    log.cmd(`[button] routing id=${id} → body="${syntheticBody}"`);

    await routeCommand(sock, { ...ctx, body: syntheticBody });
    return true;

  } catch (e) {
    log.error(`[button] unhandled error for ${ctx?.sender}: ${e.message}`);
    return false;
  }
}
