/**
 * Call Events — Phase 2
 * Handles: call (voice and video calls)
 *
 * Call object fields:
 *   id, from, date, isVideo, isGroup, callKey, status
 *   status: 'offer' | 'ringing' | 'accept' | 'reject' | 'timeout' | 'missed'
 */
import { log } from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';

const STATUS_LABELS = {
  offer:   '📞 incoming call',
  ringing: '🔔 ringing',
  accept:  '✅ call accepted',
  reject:  '❌ call rejected',
  timeout: '⏳ call timed out',
  missed:  '📵 missed call',
};

/**
 * handleCallUpdate(sock, calls)
 * calls is an array of call objects.
 */
export function handleCallUpdate(sock, calls) {
  if (!Array.isArray(calls)) return;

  for (const call of calls) {
    try {
      const from   = normalizeJid(call.from ?? '');
      const type   = call.isVideo ? 'video' : 'voice';
      const status = call.status ?? 'unknown';
      const label  = STATUS_LABELS[status] ?? `status=${status}`;

      log.event(`[call] ${label} | ${type} | from=${from} | id=${call.id ?? '?'}`);

      // Future: auto-reject calls, log missed calls to DB, notify owner, etc.
    } catch (e) {
      log.error(`[ev:call] ${e.message}`);
    }
  }
}
