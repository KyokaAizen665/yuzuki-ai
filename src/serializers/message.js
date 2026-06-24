/**
 * Universal Message Parser — Phase 2
 *
 * Normalizes ALL known Baileys message types into one consistent ctx object.
 * Unknown / future types never throw — they return a minimal ctx or null.
 * Wrapper types (viewOnce, ephemeral, documentWithCaption) are transparently
 * unwrapped so callers always deal with the concrete content type.
 */
import {
  normalizeJid, isJidGroup, isJidUser,
  isJidBroadcast, isJidNewsletter, jidToPhone,
} from '../utils/jid.js';
import { log } from '../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Keys that carry no user-visible content */
const META_KEYS = new Set([
  'messageContextInfo',
  'senderKeyDistributionMessage',
  'protocolMessage',
  'deviceSentMessage',
  'deviceSyncMessage',
  'reactionMessage',      // handled separately via raw.message
  'pollUpdateMessage',    // handled separately
]);

/** Keys that wrap another { message } object */
const WRAPPER_KEYS = new Set([
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'ephemeralMessage',
  'documentWithCaptionMessage',
  'groupMentionedMessage',
  'botInvokeMessage',
]);

/** Types that carry downloadable media */
const MEDIA_TYPES = new Set([
  'imageMessage', 'videoMessage', 'audioMessage',
  'documentMessage', 'stickerMessage', 'ptvMessage',
]);

// ─── Unwrap ───────────────────────────────────────────────────────────────────

/**
 * Recursively unwrap wrapper types.
 * Returns { outerType, contentType, contentMsg } or null.
 */
function unwrap(message) {
  if (!message || typeof message !== 'object') return null;

  // Check for wrapper types
  for (const wk of WRAPPER_KEYS) {
    const inner = message[wk]?.message;
    if (inner) {
      const result = unwrap(inner);
      if (result) return { outerType: wk, contentType: result.contentType, contentMsg: result.contentMsg };
      // wrapper has content but inner unwrap failed — fall through
    }
  }

  // Find first non-meta content key
  for (const key of Object.keys(message)) {
    if (!META_KEYS.has(key) && !WRAPPER_KEYS.has(key) && message[key] != null) {
      return { outerType: key, contentType: key, contentMsg: message };
    }
  }

  return null;
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function extractBody(contentMsg, type) {
  try {
    const m = contentMsg?.[type];
    switch (type) {
      case 'conversation':                return contentMsg.conversation ?? null;
      case 'extendedTextMessage':         return m?.text ?? null;
      case 'imageMessage':                return m?.caption ?? null;
      case 'videoMessage':                return m?.caption ?? null;
      case 'documentMessage':             return m?.caption ?? null;
      case 'audioMessage':                return null;
      case 'stickerMessage':              return m?.caption ?? null;
      case 'ptvMessage':                  return null;
      case 'buttonsMessage':              return m?.contentText ?? m?.headerText ?? null;
      case 'buttonsResponseMessage':      return m?.selectedDisplayText ?? m?.selectedButtonId ?? null;
      case 'templateMessage':             return (
                                            m?.hydratedTemplate?.hydratedContentText ??
                                            m?.fourRowTemplate?.content?.toString() ?? null
                                          );
      case 'templateButtonReplyMessage':  return m?.selectedDisplayText ?? m?.selectedId ?? null;
      case 'listMessage':                 return m?.description ?? m?.title ?? null;
      case 'listResponseMessage':         return m?.singleSelectReply?.selectedRowId ?? m?.title ?? null;
      case 'interactiveMessage':          return m?.body?.text ?? null;
      case 'interactiveResponseMessage':  return m?.nativeFlowResponseMessage?.paramsJson ?? null;
      case 'nativeFlowMessage':           return m?.name ?? null;
      case 'nativeFlowResponseMessage':   return m?.paramsJson ?? null;
      case 'reactionMessage':             return m?.text ?? null;
      case 'pollCreationMessage':
      case 'pollCreationMessageV2':
      case 'pollCreationMessageV3':       return m?.name ?? null;
      case 'pollUpdateMessage':           return null;
      case 'contactMessage':              return m?.displayName ?? null;
      case 'contactsArrayMessage':        return m?.displayName ?? null;
      case 'locationMessage':
      case 'liveLocationMessage':         return m?.name ?? m?.address ?? null;
      case 'orderMessage':                return m?.orderId ?? null;
      case 'productMessage':              return m?.product?.title ?? null;
      case 'invoiceMessage':              return m?.title ?? null;
      default:                            return null;
    }
  } catch { return null; }
}

// ─── Media ────────────────────────────────────────────────────────────────────

function extractMedia(contentMsg, type) {
  if (!MEDIA_TYPES.has(type)) return null;
  try {
    const m = contentMsg?.[type];
    if (!m) return null;
    return {
      mimetype:      m.mimetype      ?? null,
      url:           m.url           ?? null,
      directPath:    m.directPath    ?? null,
      mediaKey:      m.mediaKey      ?? null,
      fileLength:    m.fileLength     != null ? Number(m.fileLength) : null,
      fileSha256:    m.fileSha256    ?? null,
      fileEncSha256: m.fileEncSha256 ?? null,
      fileName:      m.fileName      ?? null,
      caption:       m.caption       ?? null,
      width:         m.width         ?? null,
      height:        m.height        ?? null,
      seconds:       m.seconds       ?? null,
      ptt:           m.ptt           ?? false,
      gifPlayback:   m.gifPlayback   ?? false,
    };
  } catch { return null; }
}

// ─── Context (quoted + mentions) ──────────────────────────────────────────────

function getContextInfo(contentMsg, type) {
  try {
    return contentMsg?.[type]?.contextInfo ?? contentMsg?.contextInfo ?? null;
  } catch { return null; }
}

function extractQuoted(ctxInfo) {
  if (!ctxInfo?.quotedMessage) return null;
  try {
    const qMsg    = ctxInfo.quotedMessage;
    const qResult = unwrap(qMsg);
    return {
      key: {
        id:          ctxInfo.stanzaId    ?? null,
        remoteJid:   ctxInfo.remoteJid   ?? null,
        participant: ctxInfo.participant  ? normalizeJid(ctxInfo.participant) : null,
        fromMe:      false,
      },
      sender: ctxInfo.participant
        ? normalizeJid(ctxInfo.participant)
        : (ctxInfo.remoteJid ? normalizeJid(ctxInfo.remoteJid) : null),
      type:    qResult?.contentType ?? 'unknown',
      body:    qResult ? extractBody(qResult.contentMsg, qResult.contentType) : null,
      media:   qResult ? extractMedia(qResult.contentMsg, qResult.contentType) : null,
      message: qMsg,
    };
  } catch { return null; }
}

function extractMentions(ctxInfo) {
  try {
    return Array.isArray(ctxInfo?.mentionedJid)
      ? ctxInfo.mentionedJid.map(j => normalizeJid(j)).filter(Boolean)
      : [];
  } catch { return []; }
}

// ─── Rich content extractors ──────────────────────────────────────────────────

function extractReaction(message) {
  const r = message?.reactionMessage;
  if (!r) return null;
  try {
    return {
      emoji:             r.text ?? '',
      key:               r.key  ?? null,
      senderTimestampMs: r.senderTimestampMs ?? null,
    };
  } catch { return null; }
}

function extractPoll(contentMsg, type) {
  if (!type.startsWith('pollCreation')) return null;
  try {
    const m = contentMsg?.[type];
    if (!m) return null;
    return {
      name:            m.name ?? null,
      options:         m.options?.map(o => o.optionName) ?? [],
      selectableCount: m.selectableOptionsCount ?? 1,
      encKey:          m.encKey ?? null,
    };
  } catch { return null; }
}

function extractPollUpdate(message) {
  const m = message?.pollUpdateMessage;
  if (!m) return null;
  try {
    return {
      pollKey: m.pollCreationMessageKey ?? null,
      vote:    m.vote ?? null,
    };
  } catch { return null; }
}

function extractContact(contentMsg, type) {
  if (type !== 'contactMessage' && type !== 'contactsArrayMessage') return null;
  try {
    if (type === 'contactMessage') {
      const m = contentMsg.contactMessage;
      return { displayName: m?.displayName ?? null, vcard: m?.vcard ?? null, multi: false };
    }
    const m = contentMsg.contactsArrayMessage;
    return {
      displayName: m?.displayName ?? null,
      contacts: m?.contacts?.map(c => ({ displayName: c.displayName ?? null, vcard: c.vcard ?? null })) ?? [],
      multi: true,
    };
  } catch { return null; }
}

function extractLocation(contentMsg, type) {
  if (type !== 'locationMessage' && type !== 'liveLocationMessage') return null;
  try {
    const m = contentMsg?.[type];
    return {
      latitude:  m?.degreesLatitude  ?? null,
      longitude: m?.degreesLongitude ?? null,
      accuracy:  m?.accuracyInMeters ?? null,
      speed:     m?.speedInMps       ?? null,
      name:      m?.name             ?? null,
      address:   m?.address          ?? null,
      live:      type === 'liveLocationMessage',
    };
  } catch { return null; }
}

function extractInteractive(contentMsg, type) {
  if (type !== 'interactiveMessage') return null;
  try {
    const m = contentMsg.interactiveMessage;
    return {
      header:  m?.header ?? null,
      body:    m?.body?.text ?? null,
      footer:  m?.footer?.text ?? null,
      content: m?.nativeFlowMessage
            ?? m?.collectionMessage
            ?? m?.shopStorefrontMessage
            ?? null,
    };
  } catch { return null; }
}

function extractNewsletterMeta(raw) {
  if (!isJidNewsletter(raw?.key?.remoteJid ?? '')) return null;
  return {
    newsletterJid: raw.key.remoteJid,
    serverId:      raw.key.id ?? null,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * parseMessage(raw, sock) → ctx | null
 *
 * Returns null for:
 *   - messages with no content (protocol/system messages)
 *   - messages that fail to parse (error is logged, not thrown)
 */
export function parseMessage(raw, sock) {
  try {
    if (!raw?.message || !raw?.key?.remoteJid) return null;

    const { key, message, messageTimestamp, pushName, verifiedBizName } = raw;

    const chat    = normalizeJid(key.remoteJid);
    const fromMe  = !!key.fromMe;
    const isGroup = isJidGroup(chat);
    const isNL    = isJidNewsletter(chat);

    // ── Sender ──────────────────────────────────────────────────────────────
    let sender;
    if (fromMe) {
      sender = normalizeJid(sock?.user?.id ?? '');
    } else if (isGroup || isNL) {
      sender = normalizeJid(key.participant ?? raw.participant ?? '');
    } else {
      sender = normalizeJid(chat);
    }

    // ── Unwrap ───────────────────────────────────────────────────────────────
    const unwrapped = unwrap(message);
    if (!unwrapped) {
      log.debug(`[parser] No content — keys: [${Object.keys(message).join(', ')}]`);
      return null;
    }

    const { outerType, contentType, contentMsg } = unwrapped;
    const isWrapped = outerType !== contentType;

    const timestamp = typeof messageTimestamp === 'number'
      ? messageTimestamp
      : Number(messageTimestamp ?? 0);

    // ── Context ──────────────────────────────────────────────────────────────
    const ctxInfo = getContextInfo(contentMsg, contentType);

    return {
      // Identity
      key,
      messageId: key.id,

      // Participants
      sender,
      senderPhone: jidToPhone(sender),
      pushName:    pushName ?? verifiedBizName ?? '',
      chat,

      // Flags
      fromMe,
      isGroup,
      isPrivate:    isJidUser(chat),
      isNewsletter: isNL,
      isBroadcast:  isJidBroadcast(chat) && chat !== 'status@broadcast',
      isStatus:     chat === 'status@broadcast',
      isWrapped,

      // Timing
      timestamp,

      // Type
      type:        outerType,   // outer/wrapper type key
      contentType,              // concrete content type after unwrapping

      // Body (text content)
      body: extractBody(contentMsg, contentType),

      // Rich content
      media:       extractMedia(contentMsg, contentType),
      quoted:      extractQuoted(ctxInfo),
      mentions:    extractMentions(ctxInfo),
      reaction:    extractReaction(message),
      location:    extractLocation(contentMsg, contentType),
      poll:        extractPoll(contentMsg, contentType),
      pollUpdate:  extractPollUpdate(message),
      contact:     extractContact(contentMsg, contentType),
      interactive: extractInteractive(contentMsg, contentType),
      newsletter:  extractNewsletterMeta(raw),

      // Group
      groupJid:    isGroup ? chat : null,
      participant: isGroup ? sender : null,

      // Business
      verifiedBizName: verifiedBizName ?? null,

      // Raw (for advanced plugins)
      message,
      rawMessage: raw,
    };
  } catch (e) {
    log.error(`[parser] Crash: ${e.message}`);
    return null;
  }
}
