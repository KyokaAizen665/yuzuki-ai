/**
 * Button Response Router — Yuzuki AI (Phase 2.5 repair)
 *
 * Handles NativeFlow interactive button taps, routed here from message.js
 * when ctx.contentType is 'interactiveResponseMessage' or 'nativeFlowResponseMessage'.
 *
 * Root cause of Phase 2.5 failure:
 *   The prior version relied solely on ctx.body (set by the serializer as
 *   nativeFlowResponseMessage.paramsJson). If cv3inx's proto decoder places
 *   the data in a slightly different slot — or paramsJson is empty for a given
 *   client version — ctx.body is null, JSON.parse falls back to '{}', id='' and
 *   the function returned false silently with no diagnostic log.
 *
 *   Fix: try three locations in order, log exactly which one succeeded (or log
 *   the full raw message structure so the next failure is immediately diagnosable).
 *
 * Extraction priority:
 *   1. ctx.body                  — serializer fast path (works when paramsJson lands here)
 *   2. ctx.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
 *   3. ctx.message.nativeFlowResponseMessage.paramsJson (top-level variant)
 *   4. ctx.message.buttonsResponseMessage.selectedButtonId (legacy button format)
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
 *   suggest_*         → reserved; silently ignored
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
};

function resolveBody(id) {
  if (!id) return null;
  if (STATIC_ROUTES[id])     return STATIC_ROUTES[id]();
  if (id.startsWith('cmd_')) return `${config.prefix}${id.slice(4).trim()}` || null;
  if (id.startsWith('use_')) return `${config.prefix}${id.slice(4).trim()}` || null;
  if (id.startsWith('help_')) {
    const name = id.slice(5).trim();
    return name ? `${config.prefix}help ${name}` : `${config.prefix}help`;
  }
  if (id.startsWith('suggest_')) {
    log.debug(`[button] suggest button ignored: ${id}`);
    return null;
  }
  log.warn(`[button] no route for button id: ${id}`);
  return null;
}

// ── Multi-source parameter extraction ────────────────────────────────────────

/**
 * tryParseJson(str) → object | null — never throws.
 */
function tryParseJson(str) {
  if (!str || typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * extractParams(ctx) → { id, display_text?, ... } | null
 *
 * Tries every known location where the button response parameters may land,
 * depending on cv3inx proto version and WhatsApp client behavior.
 * Logs which source succeeded so the next failure is immediately diagnosable.
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
    // body is set but doesn't contain id — log and continue to fallbacks
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
    // irm exists but paramsJson missing — maybe body.text is the display text
    if (irm.body?.text) {
      log.debug(`[button] irm.body.text="${irm.body.text}" but paramsJson missing or empty`);
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

  // ── Diagnostic: log full available structure ───────────────────────────
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

/**
 * routeButtonResponse(sock, ctx) → Promise<boolean>
 *
 * Handles an incoming button response (interactiveResponseMessage or
 * nativeFlowResponseMessage). Returns true if handled, false if ignored.
 * Never throws.
 */
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

    const syntheticBody = resolveBody(id);
    if (!syntheticBody) return false;

    log.cmd(`[button] routing id=${id} → body="${syntheticBody}"`);

    await routeCommand(sock, { ...ctx, body: syntheticBody });
    return true;

  } catch (e) {
    log.error(`[button] unhandled error for ${ctx?.sender}: ${e.message}`);
    return false;
  }
}
