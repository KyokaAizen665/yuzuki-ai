/**
 * NewsletterService — Phase 5
 *
 * Centralized abstraction over cv3inx/baileys newsletter (Channels) functions.
 * All newsletter operations go through this service — never call sock.newsletter*
 * directly in commands.
 *
 * Wrapped baileys methods:
 *   newsletterCreate, newsletterUpdate, newsletterUpdateName,
 *   newsletterUpdateDescription, newsletterUpdatePicture, newsletterRemovePicture,
 *   newsletterFollow, newsletterUnfollow, newsletterMute, newsletterUnmute,
 *   newsletterMetadata, newsletterSubscribed, newsletterSubscribers,
 *   newsletterFetchMessages, newsletterReactMessage
 *
 * Usage:
 *   import { getNewsletterService } from '../services/newsletter.js';
 *   const ns = getNewsletterService();
 *   await ns.follow('120363XXXXXXXXXX@newsletter');
 *
 * Initialization (call once when socket is ready):
 *   import { initNewsletterService } from '../services/newsletter.js';
 *   initNewsletterService(sock);
 */

import { log } from '../utils/logger.js';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * createNewsletterService(sock) → NewsletterService
 *
 * Bind newsletter operations to an active Baileys socket.
 * Re-create on reconnect.
 */
export function createNewsletterService(sock) {
  function assertMethod(name) {
    if (typeof sock?.[name] !== 'function') {
      throw new Error(`[newsletter] sock.${name} not available — use cv3inx/baileys`);
    }
  }

  return {
    /**
     * create(name, description?) → NewsletterMetadata
     * Creates a new WhatsApp Channel. Returns metadata including the JID.
     */
    async create(name, description) {
      assertMethod('newsletterCreate');
      log.info(`[newsletter] Creating channel: "${name}"`);
      return sock.newsletterCreate(name, description ?? null);
    },

    /**
     * update(jid, updates) — low-level patch; prefer named helpers.
     * @param {{ name?, description?, picture? }} updates
     */
    async update(jid, updates) {
      assertMethod('newsletterUpdate');
      return sock.newsletterUpdate(jid, updates);
    },

    /** updateName(jid, name) */
    async updateName(jid, name) {
      assertMethod('newsletterUpdateName');
      log.info(`[newsletter] Rename ${jid} → "${name}"`);
      return sock.newsletterUpdateName(jid, name);
    },

    /** updateDescription(jid, description) */
    async updateDescription(jid, description) {
      assertMethod('newsletterUpdateDescription');
      return sock.newsletterUpdateDescription(jid, description);
    },

    /**
     * updatePicture(jid, imageBuffer)
     * @param {Buffer} imageBuffer — JPEG or PNG image data
     */
    async updatePicture(jid, imageBuffer) {
      assertMethod('newsletterUpdatePicture');
      return sock.newsletterUpdatePicture(jid, imageBuffer);
    },

    /** removePicture(jid) */
    async removePicture(jid) {
      assertMethod('newsletterRemovePicture');
      return sock.newsletterRemovePicture(jid);
    },

    /**
     * follow(jid) — subscribe to a channel.
     * JID format: '120363XXXXXXXXXX@newsletter'
     */
    async follow(jid) {
      assertMethod('newsletterFollow');
      log.info(`[newsletter] Following ${jid}`);
      return sock.newsletterFollow(jid);
    },

    /** unfollow(jid) */
    async unfollow(jid) {
      assertMethod('newsletterUnfollow');
      log.info(`[newsletter] Unfollowing ${jid}`);
      return sock.newsletterUnfollow(jid);
    },

    /** mute(jid) — mute notifications; channel remains followed */
    async mute(jid) {
      assertMethod('newsletterMute');
      return sock.newsletterMute(jid);
    },

    /** unmute(jid) */
    async unmute(jid) {
      assertMethod('newsletterUnmute');
      return sock.newsletterUnmute(jid);
    },

    /**
     * metadata(type, key) → NewsletterMetadata | null
     * @param {'jid'|'invite'} type — lookup method
     * @param {string}         key  — JID or invite code
     */
    async metadata(type, key) {
      assertMethod('newsletterMetadata');
      return sock.newsletterMetadata(type, key);
    },

    /** subscribed() → all channels the bot currently follows */
    async subscribed() {
      assertMethod('newsletterSubscribed');
      return sock.newsletterSubscribed();
    },

    /** subscribers(jid) → subscriber info for a channel you own */
    async subscribers(jid) {
      assertMethod('newsletterSubscribers');
      return sock.newsletterSubscribers(jid);
    },

    /**
     * fetchMessages(type, key, count, after?, before?) → Message[]
     * @param {'jid'|'invite'} type
     * @param {number} [count=20]
     * @param {number} [after]  — server_id cursor (fetch after this ID)
     * @param {number} [before] — server_id cursor (fetch before this ID)
     */
    async fetchMessages(type, key, count = 20, after, before) {
      assertMethod('newsletterFetchMessages');
      return sock.newsletterFetchMessages(type, key, count, after, before);
    },

    /**
     * reactMessage(jid, serverId, reaction) → void
     * @param {string}      jid      — newsletter JID
     * @param {string}      serverId — message server_id (not key.id)
     * @param {string|null} reaction — emoji, or null to remove reaction
     */
    async reactMessage(jid, serverId, reaction) {
      assertMethod('newsletterReactMessage');
      return sock.newsletterReactMessage(jid, serverId, reaction ?? null);
    },

    // ── Extended cv3inx-only methods ─────────────────────────────────────────

    /**
     * adminCount(jid) → number
     * Returns the number of admins for a newsletter you own.
     */
    async adminCount(jid) {
      assertMethod('newsletterAdminCount');
      return sock.newsletterAdminCount(jid);
    },

    /**
     * changeOwner(jid, newOwnerJid) → void
     * Transfer ownership of a newsletter to another JID.
     */
    async changeOwner(jid, newOwnerJid) {
      assertMethod('newsletterChangeOwner');
      log.info(`[newsletter] changeOwner ${jid} → ${newOwnerJid}`);
      return sock.newsletterChangeOwner(jid, newOwnerJid);
    },

    /**
     * demote(jid, userJid) → void
     * Demote an admin of a newsletter you own.
     */
    async demote(jid, userJid) {
      assertMethod('newsletterDemote');
      log.info(`[newsletter] demote ${userJid} from ${jid}`);
      return sock.newsletterDemote(jid, userJid);
    },

    /**
     * delete(jid) → void
     * Permanently delete a newsletter you own. Irreversible.
     */
    async delete(jid) {
      assertMethod('newsletterDelete');
      log.warn(`[newsletter] delete channel ${jid}`);
      return sock.newsletterDelete(jid);
    },

    /**
     * subscribeUpdates(jid) → void
     * Subscribe to live updates from a newsletter (real-time message stream).
     */
    async subscribeUpdates(jid) {
      assertMethod('subscribeNewsletterUpdates');
      return sock.subscribeNewsletterUpdates(jid);
    },
  };
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _service = null;

/**
 * initNewsletterService(sock) → void
 * Call once when socket is ready. Safe to call again on reconnect.
 */
export function initNewsletterService(sock) {
  _service = createNewsletterService(sock);
  log.plugin('[newsletter] Service initialized');
}

/**
 * getNewsletterService() → NewsletterService
 * Throws if initNewsletterService() has not been called.
 */
export function getNewsletterService() {
  if (!_service) {
    throw new Error('[newsletter] Not initialized — call initNewsletterService(sock) first');
  }
  return _service;
}
