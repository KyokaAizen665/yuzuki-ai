/**
 * Events — Phase 2
 * Central export point for the event system.
 */
export { registerEvents }                from './registry.js';
export { handleMessagesUpsert,
         handleMessagesUpdate,
         handleMessagesDelete }          from './messages.js';
export { handleContactsUpdate,
         handleContactsUpsert }          from './contacts.js';
export { handleGroupsUpdate,
         handleGroupParticipantsUpdate } from './groups.js';
export { handleCallUpdate }             from './calls.js';
