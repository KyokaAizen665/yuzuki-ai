/**
 * Event Registry — Phase 2
 *
 * registerEvents(sock) wires ALL sock.ev.on() handlers.
 * Every handler is wrapped in try/catch so a crashing handler
 * never takes down the bot.
 *
 * connection.update and creds.update are managed by connection.js
 * (they were registered there in Phase 1); we don't duplicate them here.
 */
import { log } from '../utils/logger.js';
import { handleMessagesUpsert, handleMessagesUpdate, handleMessagesDelete } from './messages.js';
import { handleContactsUpdate, handleContactsUpsert } from './contacts.js';
import { handleGroupsUpdate, handleGroupParticipantsUpdate } from './groups.js';
import { handleCallUpdate } from './calls.js';

/**
 * Wrap an event handler so it never throws to the Baileys event bus.
 */
function safe(name, fn) {
  return (...args) => {
    try { fn(...args); }
    catch (e) { log.error(`[ev:${name}] Unhandled crash: ${e.message}`); }
  };
}

/**
 * Register all Phase 2 event handlers on a Baileys socket.
 * Call this once, immediately after createSocket() returns.
 */
export function registerEvents(sock) {
  // ── Messages ───────────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', safe('messages.upsert', data =>
    handleMessagesUpsert(sock, data)
  ));

  sock.ev.on('messages.update', safe('messages.update', updates =>
    handleMessagesUpdate(sock, updates)
  ));

  sock.ev.on('messages.delete', safe('messages.delete', item =>
    handleMessagesDelete(sock, item)
  ));

  // ── Contacts ───────────────────────────────────────────────────────────────
  sock.ev.on('contacts.update', safe('contacts.update', contacts =>
    handleContactsUpdate(sock, contacts)
  ));

  sock.ev.on('contacts.upsert', safe('contacts.upsert', contacts =>
    handleContactsUpsert(sock, contacts)
  ));

  // ── Groups ─────────────────────────────────────────────────────────────────
  sock.ev.on('groups.update', safe('groups.update', updates =>
    handleGroupsUpdate(sock, updates)
  ));

  sock.ev.on('group-participants.update', safe('group-participants.update', update =>
    handleGroupParticipantsUpdate(sock, update)
  ));

  // ── Calls ──────────────────────────────────────────────────────────────────
  sock.ev.on('call', safe('call', calls =>
    handleCallUpdate(sock, calls)
  ));

  // ── Newsletter ─────────────────────────────────────────────────────────────
  // Newsletters emit via messages.upsert with a @newsletter JID — handled there.
  // Dedicated newsletter events if the Baileys fork exposes them:
  if (typeof sock.ev.on === 'function') {
    try {
      sock.ev.on('newsletters', safe('newsletters', data =>
        log.event(`[newsletter] event: ${JSON.stringify(data).slice(0, 120)}`)
      ));
    } catch { /* fork may not emit 'newsletters' */ }
  }

  log.event('[events] ✓ All Phase 2 event handlers registered');
  log.debug('[events] Listening: messages.upsert, messages.update, messages.delete, contacts.update, contacts.upsert, groups.update, group-participants.update, call');
}
