/**
 * Group Events — Phase 2 + Group Welcome/Goodbye
 *
 * Handles: groups.update / group-participants.update
 * New: fires welcome messages on join and goodbye messages on leave.
 */
import { log } from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';
import { upsertGroup, getGroup } from '../database/store.js';
import { config } from '../config/index.js';

// ── Welcome / Goodbye ────────────────────────────────────────────────────────

const DEFAULT_WELCOME = 'Welcome to the group, {name}! 🎉';
const DEFAULT_GOODBYE = 'Goodbye, {name}. We\'ll miss you! 👋';

function buildMsg(template, name) {
  return (template || '').replace(/\{name\}/gi, name);
}

async function sendWelcomeGoodbye(sock, groupJid, participantJids, action) {
  const grp = getGroup(normalizeJid(groupJid));
  if (!grp) return;

  const isJoin  = action === 'add';
  const isLeave = action === 'remove';

  if (!isJoin && !isLeave) return;

  if (isJoin && !grp.welcomeEnabled) return;
  if (isLeave && !grp.goodbyeEnabled) return;

  // Fetch group metadata for participant push names if possible
  let metadata = null;
  try { metadata = await sock.groupMetadata(groupJid); } catch { /* best-effort */ }

  for (const pJid of participantJids) {
    const normalized = normalizeJid(pJid);
    // Try to get name from metadata, fallback to number
    const participant = metadata?.participants?.find(p => normalizeJid(p.id) === normalized);
    const name = participant?.notify || participant?.name || pJid.split('@')[0];

    const template = isJoin ? (grp.welcomeMsg || DEFAULT_WELCOME) : (grp.goodbyeMsg || DEFAULT_GOODBYE);
    const text     = buildMsg(template, name);

    try {
      await sock.sendMessage(groupJid, {
        text,
        mentions: [normalized],
      });
      log.event(`[group:${isJoin ? 'welcome' : 'goodbye'}] Sent for ${normalized} in ${groupJid}`);
    } catch (e) {
      log.warn(`[group:${isJoin ? 'welcome' : 'goodbye'}] Failed for ${normalized}: ${e.message}`);
    }
  }
}

// ── groups.update ─────────────────────────────────────────────────────────────

/**
 * groups.update
 * Fires when group metadata changes (name, description, settings, icon…).
 */
export function handleGroupsUpdate(sock, updates) {
  if (!Array.isArray(updates)) return;
  for (const update of updates) {
    try {
      const jid = normalizeJid(update.id ?? '');
      if (!jid) continue;

      log.event(`[group:update] ${jid}`);

      const patch = {};
      if (update.subject    !== undefined) patch.name        = update.subject;
      if (update.desc       !== undefined) patch.description = update.desc;
      if (update.owner      !== undefined) patch.ownerJid    = normalizeJid(update.owner);
      if (update.restrict   !== undefined) patch.isLocked    = update.restrict ? 1 : 0;
      if (update.announce   !== undefined) patch.isLocked    = update.announce ? 1 : patch.isLocked ?? 0;

      if (Object.keys(patch).length) {
        try { upsertGroup(jid, patch); }
        catch (dbErr) { log.error(`[group:update] DB error for ${jid}: ${dbErr.message}`); }
      }

      if (update.subject)     log.event(`[group:update] ${jid} renamed → "${update.subject}"`);
      if (update.desc)        log.event(`[group:update] ${jid} description changed`);
      if (update.restrict !== undefined) log.event(`[group:update] ${jid} restricted=${update.restrict}`);
      if (update.announce !== undefined) log.event(`[group:update] ${jid} announce=${update.announce}`);
    } catch (e) {
      log.error(`[ev:groups.update] ${e.message}`);
    }
  }
}

// ── group-participants.update ─────────────────────────────────────────────────

/**
 * group-participants.update
 * Fires when someone joins, leaves, is added, removed, promoted, demoted.
 * action: 'add' | 'remove' | 'promote' | 'demote' | 'modify'
 */
export async function handleGroupParticipantsUpdate(sock, { id, participants, action }) {
  try {
    const jid   = normalizeJid(id ?? '');
    const pJids = (participants ?? []).map(p => normalizeJid(p));

    const LABELS = {
      add:     '➕ joined',
      remove:  '➖ left',
      promote: '⬆️ promoted to admin',
      demote:  '⬇️ demoted from admin',
      modify:  '✏️ modified',
    };
    const label = LABELS[action] ?? action;

    for (const p of pJids) {
      log.event(`[group:participant] ${p} ${label} in ${jid}`);
    }

    // Update participant count in DB
    try {
      const grp = getGroup(jid);
      if (grp) {
        let count = grp.participantCount ?? 0;
        if (action === 'add')    count += pJids.length;
        if (action === 'remove') count  = Math.max(0, count - pJids.length);
        upsertGroup(jid, { participantCount: count });
      }
    } catch (dbErr) {
      log.error(`[group:participant] DB error: ${dbErr.message}`);
    }

    // Fire welcome / goodbye messages
    if (action === 'add' || action === 'remove') {
      await sendWelcomeGoodbye(sock, jid, pJids, action).catch(e =>
        log.error(`[group:welcome/goodbye] ${e.message}`)
      );
    }
  } catch (e) {
    log.error(`[ev:group-participants.update] ${e.message}`);
  }
}
