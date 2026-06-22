/**
 * Group Events — Phase 2
 * Handles: groups.update / group-participants.update
 */
import { log } from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';
import { upsertGroup, getGroup } from '../database/store.js';

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

      // Build changeset for DB — only fields that arrived in this update
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

      if (update.subject)      log.event(`[group:update] ${jid} renamed → "${update.subject}"`);
      if (update.desc)         log.event(`[group:update] ${jid} description changed`);
      if (update.restrict !== undefined) log.event(`[group:update] ${jid} restricted=${update.restrict}`);
      if (update.announce !== undefined) log.event(`[group:update] ${jid} announce=${update.announce}`);
    } catch (e) {
      log.error(`[ev:groups.update] ${e.message}`);
    }
  }
}

/**
 * group-participants.update
 * Fires when someone joins, leaves, is added, removed, promoted, demoted.
 * action: 'add' | 'remove' | 'promote' | 'demote' | 'modify'
 */
export function handleGroupParticipantsUpdate(sock, { id, participants, action }) {
  try {
    const jid  = normalizeJid(id ?? '');
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

    // Update participant count in DB if group is already tracked
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
  } catch (e) {
    log.error(`[ev:group-participants.update] ${e.message}`);
  }
}
