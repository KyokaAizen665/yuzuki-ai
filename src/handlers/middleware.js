/**
 * Command Middleware — Phase 4
 *
 * Two independent, composable layers:
 *
 *   1. PERMISSIONS — ban, publicMode, owner, premium, group/DM
 *   2. COOLDOWNS   — per-user per-command TTL (in-memory, auto-pruned)
 *
 * All functions are pure — they return results and never reply or throw.
 * The router (command.js) decides how to respond to each result.
 *
 * Permission evaluation order (first match wins):
 *   fromMe → publicMode → banned → owner-only → premium-only → group/DM
 *
 * Owner bypass rules:
 *   - Owner is always exempt from cooldowns.
 *   - Owner always passes premium, group/DM, and publicMode gates.
 *   - Owner is still subject to the ban check (safety guard).
 */
import { config } from '../config/index.js';
import { getUser, isUserBanned } from '../database/store.js';
import { normalizeJid } from '../utils/jid.js';
import { log } from '../utils/logger.js';

// ── Owner / Premium helpers ───────────────────────────────────────────────────

/**
 * isOwner(jid) → boolean
 *
 * Returns true when the JID matches the configured owner (via OWNER_NUMBER)
 * OR when the user has the `isOwner` flag set in the database.
 * The DB flag lets you grant owner-level access to additional JIDs at runtime.
 */
export function isOwner(jid) {
  if (!jid) return false;
  const normalized = normalizeJid(jid);

  // Primary: .env / config
  const num = config.ownerNumber;
  if (num) {
    const ownerJid = `${num}@s.whatsapp.net`;
    if (normalizeJid(ownerJid) === normalized) return true;
  }

  // Secondary: database flag (runtime owner grant)
  try {
    const user = getUser(normalized);
    return user?.isOwner === 1;
  } catch {
    return false;
  }
}

/**
 * isPremium(jid) → boolean
 *
 * Returns true when the JID is an owner OR has the `isPremium` DB flag.
 * Owner always has premium access — no separate grant needed.
 */
export function isPremium(jid) {
  if (!jid) return false;
  if (isOwner(jid)) return true;
  try {
    const user = getUser(normalizeJid(jid));
    return user?.isPremium === 1;
  } catch {
    return false;
  }
}

// ── Permission middleware ─────────────────────────────────────────────────────

/**
 * @typedef {{ allowed: true } | { allowed: false, reason: string }} PermResult
 */

/**
 * checkPermissions(ctx, meta) → PermResult
 *
 * Evaluates all permission gates for a command execution.
 * Returns { allowed: true } or { allowed: false, reason } — never throws.
 *
 * @param {object} ctx  — normalized message context from the serializer
 * @param {object} meta — command meta object (owner, premium, group, etc.)
 */
export function checkPermissions(ctx, meta) {
  const { sender, isGroup, fromMe } = ctx;

  // ── 0. Never block the bot's own outgoing messages ──────────────────────
  if (fromMe) return { allowed: true };

  // ── 1. publicMode gate ───────────────────────────────────────────────────
  //    When publicMode = false, only the owner can send commands.
  if (!config.publicMode && !isOwner(sender)) {
    return {
      allowed: false,
      reason: '🔒 The bot is in private mode. Only the owner can use commands.',
    };
  }

  // ── 2. Ban check ─────────────────────────────────────────────────────────
  try {
    if (isUserBanned(sender)) {
      return {
        allowed: false,
        reason: '🚫 You are banned from using this bot.',
      };
    }
  } catch (e) {
    // DB error — log and fail open (never hard-block on a DB hiccup)
    log.error(`[middleware] Ban check error for ${sender}: ${e.message}`);
  }

  // ── 3. Owner-only gate ───────────────────────────────────────────────────
  if (meta.owner) {
    if (!isOwner(sender)) {
      return {
        allowed: false,
        reason: '👑 This command is restricted to the bot owner.',
      };
    }
    // Owner passes all remaining gates — short-circuit here
    return { allowed: true };
  }

  // ── 4. Premium-only gate ─────────────────────────────────────────────────
  //    Owner always passes (handled above via short-circuit).
  if (meta.premium) {
    if (!isPremium(sender)) {
      return {
        allowed: false,
        reason: '⭐ This command is for premium users only.',
      };
    }
  }

  // ── 5. Group / DM restriction ────────────────────────────────────────────
  //    meta.group: null = anywhere | true = group only | false = DM only
  if (meta.group === true && !isGroup) {
    return {
      allowed: false,
      reason: '👥 This command can only be used in group chats.',
    };
  }
  if (meta.group === false && isGroup) {
    return {
      allowed: false,
      reason: '💬 This command can only be used in private chats.',
    };
  }

  return { allowed: true };
}

// ── Cooldown middleware ───────────────────────────────────────────────────────

/**
 * Per-user per-command cooldown store.
 * Key: `${canonicalName}:${senderJid}` → expiry timestamp (ms)
 */
const _cooldowns = new Map();

// Auto-prune every 5 minutes — keeps memory bounded without a max-size limit
const _pruner = setInterval(() => {
  const now = Date.now();
  let pruned = 0;
  for (const [key, exp] of _cooldowns) {
    if (now > exp) { _cooldowns.delete(key); pruned++; }
  }
  if (pruned) log.debug(`[middleware] Pruned ${pruned} expired cooldown(s)`);
}, 5 * 60 * 1_000);

// Don't block process exit on this interval
if (_pruner.unref) _pruner.unref();

const _cdKey = (cmdName, sender) => `${cmdName}:${sender}`;

/**
 * getRemainingCooldown(cmdName, sender) → seconds
 * Returns 0 if not on cooldown, otherwise the ceiling of remaining seconds.
 */
export function getRemainingCooldown(cmdName, sender) {
  const exp = _cooldowns.get(_cdKey(cmdName, sender));
  if (!exp) return 0;
  const ms = exp - Date.now();
  return ms > 0 ? Math.ceil(ms / 1_000) : 0;
}

/**
 * setCooldown(cmdName, sender, seconds)
 * Activates a cooldown for this user+command pair.
 */
export function setCooldown(cmdName, sender, seconds) {
  if (!seconds || seconds <= 0) return;
  _cooldowns.set(_cdKey(cmdName, sender), Date.now() + seconds * 1_000);
}

/**
 * clearCooldown(cmdName, sender)
 * Clears an active cooldown (e.g. for owner bypass or error recovery).
 */
export function clearCooldown(cmdName, sender) {
  _cooldowns.delete(_cdKey(cmdName, sender));
}

/**
 * @typedef {{ onCooldown: false } | { onCooldown: true, remaining: number }} CooldownResult
 */

/**
 * checkCooldown(cmdName, sender, meta) → CooldownResult
 *
 * Returns { onCooldown: false } when the user may proceed.
 * Returns { onCooldown: true, remaining: N } when the user must wait N seconds.
 *
 * Owner is always exempt from cooldowns.
 * Commands without a cooldown value (or cooldown <= 0) always pass.
 */
export function checkCooldown(cmdName, sender, meta) {
  const secs = meta?.cooldown ?? 0;
  if (secs <= 0) return { onCooldown: false };

  // Owner bypass
  if (isOwner(sender)) return { onCooldown: false };

  const remaining = getRemainingCooldown(cmdName, sender);
  return remaining > 0
    ? { onCooldown: true, remaining }
    : { onCooldown: false };
}
