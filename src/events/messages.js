/**
 * Message Events — Phase 2
 * Handles: messages.upsert / messages.update / messages.delete
 */
import { log } from '../utils/logger.js';
import { parseMessage } from '../serializers/message.js';
import { handleMessage } from '../handlers/message.js';

/**
 * messages.upsert
 * type='notify'  → new incoming message
 * type='append'  → historical messages loaded on startup (skip)
 */
export function handleMessagesUpsert(sock, { messages, type }) {
  if (type !== 'notify') return;

  for (const raw of messages) {
    try {
      if (!raw?.message) continue;       // protocol / status-only frames
      if (raw.key?.fromMe && !raw.message?.reactionMessage) {
        // Log own sent messages at debug level but don't process them
        log.debug(`[msg:out] ${raw.key.id} → ${raw.key.remoteJid}`);
        // Still process fromMe so plugins can track bot actions
      }

      const ctx = parseMessage(raw, sock);
      if (!ctx) continue;
      if (ctx.isStatus) {
        log.debug(`[msg:status] skipped status from ${ctx.sender}`);
        continue;
      }

      const label = ctx.isGroup
        ? `${ctx.contentType} | ${ctx.sender} → ${ctx.chat}`
        : `${ctx.contentType} | ${ctx.sender}`;
      log.event(`[msg] ${label}${ctx.body ? ` "${ctx.body.slice(0, 60)}"` : ''}`);

      // Fire-and-forget through the message pipeline
      handleMessage(sock, ctx).catch(e =>
        log.error(`[msg] Pipeline error [${ctx.messageId}]: ${e.message}`)
      );
    } catch (e) {
      log.error(`[ev:messages.upsert] ${e.message}`);
    }
  }
}

/**
 * messages.update
 * Carries read-receipts, delivery updates, reactions, edits.
 */
export function handleMessagesUpdate(sock, updates) {
  if (!Array.isArray(updates)) return;
  for (const update of updates) {
    try {
      const { key, update: delta } = update;
      if (!key) continue;

      if (delta?.status !== undefined) {
        // 0=ERROR 1=PENDING 2=SERVER_ACK 3=DELIVERY_ACK 4=READ 5=PLAYED
        const STATUS_LABELS = ['ERROR','PENDING','SERVER_ACK','DELIVERY_ACK','READ','PLAYED'];
        const statusLabel = STATUS_LABELS[delta.status] ?? `STATUS_${delta.status}`;
        log.debug(`[msg:update] ${key.id} status=${statusLabel}`);
      }

      if (delta?.message) {
        // Message edit
        log.debug(`[msg:edit] ${key.id} in ${key.remoteJid}`);
      }

      if (delta?.messageStubType !== undefined) {
        log.debug(`[msg:stub] ${key.id} stubType=${delta.messageStubType}`);
      }
    } catch (e) {
      log.error(`[ev:messages.update] ${e.message}`);
    }
  }
}

/**
 * messages.delete
 * Notifies when messages are revoked / deleted for everyone.
 */
export function handleMessagesDelete(sock, item) {
  try {
    if ('keys' in item) {
      // Individual keys deleted
      const count = item.keys?.length ?? 0;
      const jid   = item.keys?.[0]?.remoteJid ?? '?';
      log.event(`[msg:delete] ${count} message(s) revoked in ${jid}`);
    } else if ('jid' in item) {
      // Entire chat cleared
      log.event(`[msg:delete] Chat cleared: ${item.jid}`);
    }
  } catch (e) {
    log.error(`[ev:messages.delete] ${e.message}`);
  }
}
