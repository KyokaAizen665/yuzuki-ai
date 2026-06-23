/**
 * Button Response Router — Yuzuki AI
 *
 * Routes NativeFlow interactive button responses to the existing command
 * pipeline. Called by message.js when ctx.contentType === 'interactiveResponseMessage'.
 *
 * How button responses arrive (from serializers/message.js):
 *   ctx.contentType = 'interactiveResponseMessage'
 *   ctx.body        = paramsJson string, e.g. '{"id":"cmd_owner","display_text":"👑 Owner","version":3}'
 *   ctx.sender      = user JID (not the bot — button clicks come from the user)
 *   ctx.fromMe      = false
 *
 * Routing constructs a synthetic ctx.body that starts with the prefix, then
 * delegates to routeCommand — so all permission checks, cooldowns, and error
 * handling apply exactly as they would for a typed command.
 *
 * Button ID conventions (used across all command files):
 *   cmd_<name>        → run: .<name>
 *   use_<name>        → run: .<name>
 *   help_<name>       → run: .help <name>   (shows detail view for a command)
 *   open_menu         → run: .help           (re-opens full menu)
 *   back_menu         → run: .help           (back to menu from detail view)
 *   follow_official   → run: .channel follow <officialChannelJid>
 *   ch_follow         → run: .channel follow (partial — jid must be in session)
 *   ch_unfollow       → run: .channel unfollow
 *   ch_mute           → run: .channel mute
 *   ch_unmute         → run: .channel unmute
 *   suggest_*         → reserved for AI suggestions; silently ignored here
 */

import { log }          from '../utils/logger.js';
import { config }       from '../config/index.js';
import { routeCommand } from './command.js';

// ── Static button ID → synthetic body resolver ───────────────────────────────

/**
 * Resolvers for button IDs that map to fixed command strings.
 * Each value is a zero-arg function so config reads happen at call-time
 * (not at module load), allowing hot-reload of config values.
 */
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
};

/**
 * resolveBody(id) → string | null
 *
 * Maps a button ID to a synthetic command body (e.g. ".owner").
 * Returns null if the button should be silently ignored.
 */
function resolveBody(id) {
  if (!id) return null;

  // 1. Static override (highest priority)
  if (STATIC_ROUTES[id]) return STATIC_ROUTES[id]();

  // 2. cmd_<name> → .<name>  (main menu buttons: cmd_owner, cmd_channel, cmd_help)
  if (id.startsWith('cmd_')) {
    const name = id.slice(4).trim();
    return name ? `${config.prefix}${name}` : null;
  }

  // 3. use_<name> → .<name>  (detail view "run this command" buttons)
  if (id.startsWith('use_')) {
    const name = id.slice(4).trim();
    return name ? `${config.prefix}${name}` : null;
  }

  // 4. help_<name> → .help <name>  (error cards "get help for X")
  if (id.startsWith('help_')) {
    const name = id.slice(5).trim();
    return name ? `${config.prefix}help ${name}` : `${config.prefix}help`;
  }

  // 5. suggest_* — AI prompt suggestions; not wired in this phase
  if (id.startsWith('suggest_')) {
    log.debug(`[button] Ignoring unhandled suggest button: ${id}`);
    return null;
  }

  // Unknown ID — log and ignore
  log.warn(`[button] Unknown button id — no route defined: ${id}`);
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * routeButtonResponse(sock, ctx) → Promise<boolean>
 *
 * Handles an incoming interactiveResponseMessage.
 *   • Parses paramsJson from ctx.body
 *   • Resolves button id to a synthetic command body
 *   • Delegates to routeCommand (full permission + cooldown pipeline)
 *
 * Returns true if a route was found and executed (or attempted).
 * Returns false if the button was ignored or had an invalid payload.
 *
 * Never throws — all errors are caught and logged.
 */
export async function routeButtonResponse(sock, ctx) {
  try {
    // Deserialise paramsJson — ctx.body IS the raw JSON string
    let params = {};
    try {
      params = JSON.parse(ctx.body || '{}');
    } catch {
      log.warn(`[button] Could not parse paramsJson: ${ctx.body?.slice(0, 120)}`);
      return false;
    }

    const id          = params.id          ?? '';
    const displayText = params.display_text ?? id;

    if (!id) {
      log.debug(`[button] Empty button id — sender: ${ctx.sender}, body: ${ctx.body?.slice(0, 80)}`);
      return false;
    }

    log.event(`[button] ${ctx.sender} → "${displayText}" (id=${id})`);

    const syntheticBody = resolveBody(id);
    if (!syntheticBody) return false;

    log.cmd(`[button] routing ${id} → ${syntheticBody}`);

    // Delegate through the full command router — permissions and cooldowns apply
    await routeCommand(sock, { ...ctx, body: syntheticBody });
    return true;

  } catch (e) {
    log.error(`[button] Unhandled error for ${ctx?.sender}: ${e.message}`);
    return false;
  }
}
