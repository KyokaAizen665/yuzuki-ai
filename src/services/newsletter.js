/**
   * NewsletterService — Phase 5
   *
   * Centralized abstraction over cv3inx/baileys newsletter (Channels) functions.
   * All newsletter operations go through this service — never call sock.newsletter*
   * directly in commands.
   *
   * Wrapped baileys methods:
   *   newsletterCreate           — create a new Channel
   *   newsletterUpdate           — low-level metadata update
   *   newsletterUpdateName       — rename channel
   *   newsletterUpdateDescription— update description
   *   newsletterUpdatePicture    — update channel picture
   *   newsletterRemovePicture    — remove channel picture
   *   newsletterFollow           — subscribe to a channel
   *   newsletterUnfollow         — unsubscribe from a channel
   *   newsletterMute             — mute channel notifications
   *   newsletterUnmute           — unmute channel notifications
   *   newsletterMetadata         — fetch channel metadata (by JID or invite)
   *   newsletterSubscribed       — list all channels the bot follows
   *   newsletterSubscribers      — get subscriber info for owned channel
   *   newsletterFetchMessages    — fetch channel messages
   *   newsletterReactMessage     — react/unreact to a channel message
   *
   * Usage:
   *   import { getNewsletterService } from '../services/newsletter.js';
   *   const ns = getNewsletterService();
   *   const channel = await ns.create('My Channel', 'About this channel');
   *   await ns.follow('123456789@newsletter');
   *
   * Initialization (call once when socket is ready, e.g. in events/registry.js):
   *   import { initNewsletterService } from '../services/newsletter.js';
   *   initNewsletterService(sock);
   */

  import { log } from '../utils/logger.js';

  // ── Factory ───────────────────────────────────────────────────────────────────

  /**
   * createNewsletterService(sock) → NewsletterService
   *
   * Bind newsletter operations to an active Baileys socket.
   * Re-create when the socket reconnects.
   */
  export function createNewsletterService(sock) {
    function assertMethod(name) {
      if (typeof sock?.[name] !== 'function') {
        throw new Error(
          `[newsletter] sock.${name} is not available — ensure you are using cv3inx/baileys`,
        );
      }
    }

    return {
      /**
       * create(name, description?) → NewsletterMetadata
       *
       * Creates a new WhatsApp Channel (newsletter).
       * Returns metadata including the channel JID.
       */
      async create(name, description) {
        assertMethod('newsletterCreate');
        log.info(`[newsletter] Creating channel: "${name}"`);
        return await sock.newsletterCreate(name, description ?? null);
      },

      /**
       * update(jid, updates) → void
       *
       * Low-level metadata update. Prefer the specific helpers below.
       * @param {{ name?, description?, picture? }} updates
       */
      async update(jid, updates) {
        assertMethod('newsletterUpdate');
        return await sock.newsletterUpdate(jid, updates);
      },

      /**
       * updateName(jid, name) → void
       */
      async updateName(jid, name) {
        assertMethod('newsletterUpdateName');
        log.info(`[newsletter] Renaming ${jid} → "${name}"`);
        return await sock.newsletterUpdateName(jid, name);
      },

      /**
       * updateDescription(jid, description) → void
       */
      async updateDescription(jid, description) {
        assertMethod('newsletterUpdateDescription');
        return await sock.newsletterUpdateDescription(jid, description);
      },

      /**
       * updatePicture(jid, imageBuffer) → void
       *
       * Sets or replaces the channel profile picture.
       * @param {Buffer} imageBuffer — JPEG or PNG image data
       */
      async updatePicture(jid, imageBuffer) {
        assertMethod('newsletterUpdatePicture');
        return await sock.newsletterUpdatePicture(jid, imageBuffer);
      },

      /**
       * removePicture(jid) → void
       */
      async removePicture(jid) {
        assertMethod('newsletterRemovePicture');
        return await sock.newsletterRemovePicture(jid);
      },

      /**
       * follow(jid) → void
       *
       * Subscribe to a channel by JID.
       * JID format: '120363XXXXXXXXXX@newsletter'
       */
      async follow(jid) {
        assertMethod('newsletterFollow');
        log.info(`[newsletter] Following ${jid}`);
        return await sock.newsletterFollow(jid);
      },

      /**
       * unfollow(jid) → void
       */
      async unfollow(jid) {
        assertMethod('newsletterUnfollow');
        log.info(`[newsletter] Unfollowing ${jid}`);
        return await sock.newsletterUnfollow(jid);
      },

      /**
       * mute(jid) → void
       * Mute channel notifications (channel remains followed).
       */
      async mute(jid) {
        assertMethod('newsletterMute');
        return await sock.newsletterMute(jid);
      },

      /**
       * unmute(jid) → void
       */
      async unmute(jid) {
        assertMethod('newsletterUnmute');
        return await sock.newsletterUnmute(jid);
      },

      /**
       * metadata(type, key) → NewsletterMetadata | null
       *
       * Fetch channel metadata.
       * @param {'jid' | 'invite'} type — lookup type
       * @param {string}           key  — JID or invite code
       */
      async metadata(type, key) {
        assertMethod('newsletterMetadata');
        return await sock.newsletterMetadata(type, key);
      },

      /**
       * subscribed() → NewsletterMetadata[]
       *
       * Returns all channels the bot is currently following.
       */
      async subscribed() {
        assertMethod('newsletterSubscribed');
        return await sock.newsletterSubscribed();
      },

      /**
       * subscribers(jid) → object
       *
       * Returns subscriber count/info for a channel you own.
       */
      async subscribers(jid) {
        assertMethod('newsletterSubscribers');
        return await sock.newsletterSubscribers(jid);
      },

      /**
       * fetchMessages(type, key, count, after?, before?) → Message[]
       *
       * Fetch messages from a channel.
       * @param {'jid' | 'invite'} type
       * @param {string}           key
       * @param {number}           [count=20] — number of messages to fetch
       * @param {number}           [after]    — server_id cursor (fetch after)
       * @param {number}           [before]   — server_id cursor (fetch before)
       */
      async fetchMessages(type, key, count = 20, after, before) {
        assertMethod('newsletterFetchMessages');
        return await sock.newsletterFetchMessages(type, key, count, after, before);
      },

      /**
       * reactMessage(jid, serverId, reaction) → void
       *
       * React to a channel message.
       * @param {string}      jid       — newsletter JID
       * @param {string}      serverId  — message server_id (not key.id)
       * @param {string|null} reaction  — emoji string, or null to remove reaction
       */
      async reactMessage(jid, serverId, reaction) {
        assertMethod('newsletterReactMessage');
        return await sock.newsletterReactMessage(jid, serverId, reaction ?? null);
      },
    };
  }

  // ── Module-level singleton ────────────────────────────────────────────────────

  let _service = null;

  /**
   * initNewsletterService(sock) → void
   *
   * Initialize the singleton. Call once when the socket becomes ready.
   * Safe to call again on reconnect — replaces the previous instance.
   */
  export function initNewsletterService(sock) {
    _service = createNewsletterService(sock);
    log.plugin('[newsletter] Service initialized');
  }

  /**
   * getNewsletterService() → NewsletterService
   *
   * Returns the singleton. Throws if initNewsletterService() has not been called.
   */
  export function getNewsletterService() {
    if (!_service) {
      throw new Error('[newsletter] Service not initialized — call initNewsletterService(sock) first');
    }
    return _service;
  }
  