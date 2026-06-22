/**
 * Contact Events — Phase 2
 * Handles: contacts.update / contacts.upsert
 */
import { log } from '../utils/logger.js';
import { normalizeJid } from '../utils/jid.js';

/**
 * contacts.update
 * Fires when a contact's name, status, or profile picture changes.
 */
export function handleContactsUpdate(sock, contacts) {
  if (!Array.isArray(contacts)) return;
  for (const contact of contacts) {
    try {
      const jid  = normalizeJid(contact.id ?? '');
      const name = contact.notify ?? contact.verifiedName ?? contact.name ?? null;
      if (name) {
        log.debug(`[contact:update] ${jid} → name="${name}"`);
      }
      if (contact.imgUrl !== undefined) {
        log.debug(`[contact:update] ${jid} → avatar changed`);
      }
      if (contact.status !== undefined) {
        log.debug(`[contact:update] ${jid} → status="${contact.status}"`);
      }
    } catch (e) {
      log.error(`[ev:contacts.update] ${e.message}`);
    }
  }
}

/**
 * contacts.upsert
 * Fires when new contacts are loaded from the contact store.
 */
export function handleContactsUpsert(sock, contacts) {
  if (!Array.isArray(contacts)) return;
  log.debug(`[contact:upsert] ${contacts.length} contact(s) synced`);
}
