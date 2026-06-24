/**
 * Centralized Permission System — Yuzuki AI
 *
 * Single source of truth for ALL permission checks across text commands,
 * button commands, sticker-triggered commands, and any future interaction type.
 *
 * Permission levels (lowest → highest):
 *   public      — any user
 *   premium     — users with isPremium DB flag (owner always passes)
 *   group       — must be sent in a group chat
 *   private     — must be sent in a private/DM chat
 *   admin       — sender must be a group admin (or bot owner)
 *   groupOwner  — sender must be the group creator/superadmin (or bot owner)
 *   owner       — bot owner only
 *
 * Public API:
 *   checkPermission(meta, ctx, sock) → Promise<{ allowed, reason? }>
 *   isOwner(jid)   → boolean
 *   isPremium(jid) → boolean
 *   checkCooldown(cmdName, sender, meta)  → CooldownResult
 *   setCooldown(cmdName, sender, seconds) → void
 *   getRemainingCooldown(cmdName, sender) → number
 *   clearCooldown(cmdName, sender) → void
 *
 * Debug log format:
 *   [PERMISSION] command=<name> permission=<level> result=allowed|denied reason=<msg>
 */

import { config }            from '../config/index.js';
import { getUser, isUserBanned } from '../database/store.js';
import { normalizeJid }      from '../utils/jid.js';
import { log }               from '../utils/logger.js';

// ── Owner / Premium helpers ───────────────────────────────────────────────────

/**
 * isOwner(jid) → boolean
 * Returns true when the JID matches the configured OWNER_NUMBER
 * OR when the user's DB record has isOwner = 1 (runtime grant).
 */
export function isOwner(jid) {
  if (!jid) return false;
  const normalized = normalizeJid(jid);

  const num = config.ownerNumber;
  if (num) {
    const ownerJid = `${num}@s.whatsapp.net`;
    if (normalizeJid(ownerJid) === normalized) return true;
  }

  try {
    const user = getUser(normalized);
    return user?.isOwner === 1;
  } catch {
    return false;
  }
}

/**
 * isPremium(jid) → boolean
 * Owner always passes — no separate grant needed.
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

// ── Denial messages (exact strings as specified) ──────────────────────────────

const DENIAL = {
  owner:      '❌ Owner only command.',
  admin:      '❌ Admin privileges required.',
  groupOwner: '❌ Admin privileges required.',
  premium:    '❌ Premium access required.',
  group:      '❌ This command only works in groups.',
  private:    '❌ This command only works in private chat.',
};

// ── Group admin helper ────────────────────────────────────────────────────────

/**
 * getGroupRole(sock, groupJid, senderJid)
 * → 'superadmin' | 'admin' | 'member' | null
 *
 * Fetches group metadata and returns the sender's role.
 * Returns null on any error (fail open — don't hard-block on a metadata fetch).
 */
async function getGroupRole(sock, groupJid, senderJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const me = meta?.participants?.find(
      p => normalizeJid(p.id) === normalizeJid(senderJid)
    );
    return me?.admin ?? 'member';
  } catch (e) {
    log.warn(`[permissions] groupMetadata failed for ${groupJid}: ${e.message}`);
    return null;
  }
}

// ── Resolve effective permission level from meta ───────────────────────────────

/**
 * resolveLevel(meta) → string
 *
 * Reads the new `meta.permission` field first.
 * Falls back to the legacy boolean triplet (owner/premium/group) for backward compat.
 */
function resolveLevel(meta) {
  if (meta.permission) return meta.permission;

  // Legacy backward compat
  if (meta.owner === true)   return 'owner';
  if (meta.premium === true) return 'premium';
  if (meta.group === true)   return 'group';
  if (meta.group === false)  return 'private';
  return 'public';
}

// ── Main permission check ─────────────────────────────────────────────────────

/**
 * @typedef {{ allowed: true } | { allowed: false, reason: string }} PermResult
 */

/**
 * checkPermission(meta, ctx, sock) → Promise<PermResult>
 *
 * The single permission gate for ALL interaction types:
 *   text commands, button commands, sticker-triggered commands, future types.
 *
 * @param {object} meta — command meta object (must have `permission` field)
 * @param {object} ctx  — normalized message context from the serializer
 * @param {object} sock — Baileys socket (needed for admin/groupOwner checks)
 */
export async function checkPermission(meta, ctx, sock) {
  const { sender, isGroup, fromMe, chat } = ctx;
  const cmdName = meta.name ?? '?';
  const level   = resolveLevel(meta);

  /** emit a structured [PERMISSION] debug line */
  const permLog = (result, extra = '') =>
    log.debug(
      `[PERMISSION] command=${cmdName} permission=${level} result=${result}` +
      (extra ? ` reason=${extra}` : '')
    );

  // ── 0. Bot's own outgoing messages always pass ───────────────────────────
  if (fromMe) {
    permLog('allowed', 'fromMe');
    return { allowed: true };
  }

  // ── 1. publicMode gate ───────────────────────────────────────────────────
  if (!config.publicMode && !isOwner(sender)) {
    const reason = '🔒 The bot is in private mode. Only the owner can use commands.';
    permLog('denied', 'publicMode');
    return { allowed: false, reason };
  }

  // ── 2. Ban check ─────────────────────────────────────────────────────────
  try {
    if (isUserBanned(sender)) {
      permLog('denied', 'banned');
      return { allowed: false, reason: '🚫 You are banned from using this bot.' };
    }
  } catch (e) {
    log.error(`[permissions] ban check error for ${sender}: ${e.message}`);
    // Fail open — DB hiccup should not block users
  }

  // ── 3. Owner always bypasses everything except ban ───────────────────────
  const senderIsOwner = isOwner(sender);
  if (senderIsOwner && level !== 'owner') {
    // Owner can use any non-owner-gated command freely
  }

  // ── 4. Level-specific gate ───────────────────────────────────────────────

  switch (level) {
    case 'public':
      // No additional restriction
      permLog('allowed');
      return { allowed: true };

    case 'premium':
      if (!isPremium(sender)) {
        permLog('denied', 'not-premium');
        return { allowed: false, reason: DENIAL.premium };
      }
      permLog('allowed');
      return { allowed: true };

    case 'group':
      if (!isGroup) {
        permLog('denied', 'not-in-group');
        return { allowed: false, reason: DENIAL.group };
      }
      permLog('allowed');
      return { allowed: true };

    case 'private':
      if (isGroup) {
        permLog('denied', 'not-in-dm');
        return { allowed: false, reason: DENIAL.private };
      }
      permLog('allowed');
      return { allowed: true };

    case 'admin': {
      if (!isGroup) {
        permLog('denied', 'admin-requires-group');
        return { allowed: false, reason: DENIAL.group };
      }
      // Owner always passes admin gate
      if (senderIsOwner) {
        permLog('allowed', 'owner-bypasses-admin');
        return { allowed: true };
      }
      const role = await getGroupRole(sock, chat, sender);
      const ok   = role === 'admin' || role === 'superadmin';
      if (!ok) {
        permLog('denied', 'not-admin');
        return { allowed: false, reason: DENIAL.admin };
      }
      permLog('allowed');
      return { allowed: true };
    }

    case 'groupOwner': {
      if (!isGroup) {
        permLog('denied', 'groupOwner-requires-group');
        return { allowed: false, reason: DENIAL.group };
      }
      // Bot owner bypasses
      if (senderIsOwner) {
        permLog('allowed', 'owner-bypasses-groupOwner');
        return { allowed: true };
      }
      const role = await getGroupRole(sock, chat, sender);
      if (role !== 'superadmin') {
        permLog('denied', 'not-groupOwner');
        return { allowed: false, reason: DENIAL.groupOwner };
      }
      permLog('allowed');
      return { allowed: true };
    }

    case 'owner':
      if (!senderIsOwner) {
        permLog('denied', 'not-owner');
        return { allowed: false, reason: DENIAL.owner };
      }
      permLog('allowed');
      return { allowed: true };

    default:
      // Unknown level — fail open with a warning
      log.warn(`[permissions] Unknown permission level "${level}" for command "${cmdName}" — defaulting to public`);
      permLog('allowed', `unknown-level:${level}`);
      return { allowed: true };
  }
}

// ── Cooldown middleware ───────────────────────────────────────────────────────
// Kept here so the old middleware.js re-export is a single import.

/** Map<`${cmdName}:${sender}`, expiryMs> */
const _cooldowns = new Map();

const _pruner = setInterval(() => {
  const now    = Date.now();
  let   pruned = 0;
  for (const [key, exp] of _cooldowns) {
    if (now > exp) { _cooldowns.delete(key); pruned++; }
  }
  if (pruned) log.debug(`[permissions] Pruned ${pruned} expired cooldown(s)`);
}, 5 * 60 * 1_000);
if (_pruner.unref) _pruner.unref();

const _cdKey = (name, sender) => `${name}:${sender}`;

export function getRemainingCooldown(cmdName, sender) {
  const exp = _cooldowns.get(_cdKey(cmdName, sender));
  if (!exp) return 0;
  const ms = exp - Date.now();
  return ms > 0 ? Math.ceil(ms / 1_000) : 0;
}

export function setCooldown(cmdName, sender, seconds) {
  if (!seconds || seconds <= 0) return;
  _cooldowns.set(_cdKey(cmdName, sender), Date.now() + seconds * 1_000);
}

export function clearCooldown(cmdName, sender) {
  _cooldowns.delete(_cdKey(cmdName, sender));
}

/**
 * @typedef {{ onCooldown: false } | { onCooldown: true, remaining: number }} CooldownResult
 */

export function checkCooldown(cmdName, sender, meta) {
  const secs = meta?.cooldown ?? 0;
  if (secs <= 0) return { onCooldown: false };
  if (isOwner(sender)) return { onCooldown: false };
  const remaining = getRemainingCooldown(cmdName, sender);
  return remaining > 0
    ? { onCooldown: true, remaining }
    : { onCooldown: false };
}

// ── Legacy alias (used by command.js pre-migration) ───────────────────────────

/**
 * checkPermissions(ctx, meta) → sync PermResult
 * @deprecated Use checkPermission(meta, ctx, sock) instead.
 * Kept for one-step migration; does NOT support admin/groupOwner levels.
 */
export function checkPermissions(ctx, meta) {
  const { sender, isGroup, fromMe } = ctx;
  const level = resolveLevel(meta);

  if (fromMe) return { allowed: true };
  if (!config.publicMode && !isOwner(sender)) {
    return { allowed: false, reason: '🔒 The bot is in private mode. Only the owner can use commands.' };
  }
  try {
    if (isUserBanned(sender)) return { allowed: false, reason: '🚫 You are banned from using this bot.' };
  } catch { /* fail open */ }

  switch (level) {
    case 'owner':
      return isOwner(sender) ? { allowed: true } : { allowed: false, reason: DENIAL.owner };
    case 'premium':
      return isPremium(sender) ? { allowed: true } : { allowed: false, reason: DENIAL.premium };
    case 'group':
      return isGroup ? { allowed: true } : { allowed: false, reason: DENIAL.group };
    case 'private':
      return !isGroup ? { allowed: true } : { allowed: false, reason: DENIAL.private };
    default:
      return { allowed: true };
  }
}
