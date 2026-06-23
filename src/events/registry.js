/**
   * Event Registry — Phase 2 / Phase 5
   *
   * registerEvents(sock) wires ALL sock.ev.on() handlers and initializes
   * Phase 5 services (NewsletterService, BusinessService) on the socket.
   *
   * connection.update and creds.update are managed by connection.js
   * (they were registered there in Phase 1); we don't duplicate them here.
   */
  import { log } from '../utils/logger.js';
  import { handleMessagesUpsert, handleMessagesUpdate, handleMessagesDelete } from './messages.js';
  import { handleContactsUpdate, handleContactsUpsert } from './contacts.js';
  import { handleGroupsUpdate, handleGroupParticipantsUpdate } from './groups.js';
  import { handleCallUpdate } from './calls.js';
  import { initNewsletterService } from '../services/newsletter.js';
  import { initBusinessService }   from '../services/business.js';

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
   * Register all event handlers on a Baileys socket and initialize Phase 5
   * services. Called once immediately after createSocket() returns.
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

    // ── Phase 5 services ───────────────────────────────────────────────────────
    // Bind NewsletterService and BusinessService to this socket instance.
    // Safe to call before 'connection.update → open': both services only store
    // a sock reference and validate methods lazily on first use.
    try {
      initNewsletterService(sock);
    } catch (e) {
      log.warn(`[events] NewsletterService init skipped: ${e.message}`);
    }
    try {
      initBusinessService(sock);
    } catch (e) {
      log.warn(`[events] BusinessService init skipped: ${e.message}`);
    }

    log.event('[events] ✓ All event handlers registered — Phase 5 services online');
    log.debug('[events] Listening: messages.upsert, messages.update, messages.delete, contacts.update, contacts.upsert, groups.update, group-participants.update, call');
  }
  