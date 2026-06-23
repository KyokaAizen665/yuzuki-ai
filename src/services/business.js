/**
 * BusinessService — Phase 5
 *
 * Abstraction over cv3inx/baileys business, catalog, and product functions.
 * All business operations go through this service.
 *
 * Stable methods (available in cv3inx/baileys):
 *   getCatalog      — fetch product catalog (own or another JID)
 *   getCollections  — fetch product collections
 *   getOrderDetails — fetch full order from a received orderMessage
 *   updateProfile   — update business profile (address, email, hours, etc.)
 *
 * Not supported in Baileys client SDK (explicitly documented):
 *   createProduct / editProduct / deleteProduct
 *     → Requires WhatsApp Business Management API (Meta Graph API).
 *     → Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/catalogs
 *
 *   shopStorefrontMessage
 *     → Implemented in RichMessageService.sendCollection() via proto-level
 *       interactiveMessage construction.
 *
 * Usage:
 *   import { getBusinessService } from '../services/business.js';
 *   const bs = getBusinessService();
 *   const { products } = await bs.getCatalog({ limit: 20 });
 *
 * Initialization:
 *   import { initBusinessService } from '../services/business.js';
 *   initBusinessService(sock);
 */

import { log } from '../utils/logger.js';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * createBusinessService(sock) → BusinessService
 */
export function createBusinessService(sock) {
  function assertMethod(name) {
    if (typeof sock?.[name] !== 'function') {
      throw new Error(
        `[business] sock.${name} not available — ` +
        `use cv3inx/baileys with a WhatsApp Business account`,
      );
    }
  }

  return {
    /**
     * getCatalog({ jid?, limit?, cursor? }) → { products, cursor }
     *
     * Fetch the product catalog. Omit jid to use the bot's own catalog.
     */
    async getCatalog({ jid, limit = 10, cursor } = {}) {
      assertMethod('getCatalog');
      log.info(`[business] getCatalog jid=${jid ?? 'self'} limit=${limit}`);
      return sock.getCatalog({ jid, limit, cursor });
    },

    /**
     * getCollections(jid?, limit?) → { collections }
     *
     * @param {string} [jid]   — defaults to bot's own JID
     * @param {number} [limit] — max collections to return (default 51)
     */
    async getCollections(jid, limit = 51) {
      assertMethod('getCollections');
      log.info(`[business] getCollections jid=${jid ?? 'self'}`);
      return sock.getCollections(jid, limit);
    },

    /**
     * getOrderDetails(orderId, tokenBase64) → OrderDetails
     *
     * Fetch full order details. Extract orderId and token from:
     *   ctx.rawMessage.message.orderMessage.{ orderId, token }
     */
    async getOrderDetails(orderId, tokenBase64) {
      assertMethod('getOrderDetails');
      log.info(`[business] getOrderDetails ${orderId}`);
      return sock.getOrderDetails(orderId, tokenBase64);
    },

    /**
     * updateProfile(updates) → void
     *
     * Update the WhatsApp Business profile.
     * Note: baileys method has a typo — 'updateBussinesProfile' (intentional).
     *
     * @param {{
     *   address?:     string,
     *   email?:       string,
     *   description?: string,
     *   websites?:    string[],
     *   hours?: {
     *     timezone: string,
     *     days: Array<{
     *       day: string,
     *       mode: 'open_24h' | 'closed' | 'specific_hours',
     *       openTimeInMinutes?:  number,
     *       closeTimeInMinutes?: number,
     *     }>
     *   }
     * }} updates
     */
    async updateProfile(updates) {
      assertMethod('updateBussinesProfile');
      log.info('[business] updateProfile');
      return sock.updateBussinesProfile(updates);
    },

    // ── Unsupported — explicit errors with REST API guidance ─────────────────

    /**
     * createProduct() — NOT SUPPORTED in Baileys client SDK.
     *
     * Product CRUD (create/edit/delete) requires the WhatsApp Business
     * Management API (Meta Graph API):
     *   POST /v19.0/{whatsapp-business-account-id}/products
     *   Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/catalogs
     */
    createProduct() {
      throw new Error(
        '[business] createProduct not supported in Baileys. ' +
        'Use Meta Graph API: https://developers.facebook.com/docs/whatsapp/business-management-api/catalogs',
      );
    },

    editProduct() {
      throw new Error('[business] editProduct not supported in Baileys — use Meta Graph API.');
    },

    deleteProduct() {
      throw new Error('[business] deleteProduct not supported in Baileys — use Meta Graph API.');
    },
  };
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _service = null;

/**
 * initBusinessService(sock) → void
 * Call once when socket is ready. Safe to call again on reconnect.
 */
export function initBusinessService(sock) {
  _service = createBusinessService(sock);
  log.plugin('[business] Service initialized');
}

/**
 * getBusinessService() → BusinessService
 * Throws if not initialized.
 */
export function getBusinessService() {
  if (!_service) {
    throw new Error('[business] Not initialized — call initBusinessService(sock) first');
  }
  return _service;
}
