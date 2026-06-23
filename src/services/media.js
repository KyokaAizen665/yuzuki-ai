/**
   * MediaService — Phase 5
   *
   * Centralised helpers for all media operations:
   *   sendImage / sendVideo / sendAudio / sendDocument / sendSticker
   *   sendMediaAuto     — detect type from MIME and dispatch
   *   downloadMedia     — download incoming WA media to Buffer
   *   downloadToTemp    — download and save to configured temp dir
   *   guessMime         — file extension → MIME type
   *   mediaType         — MIME type → baileys content key
   */

  import { createRequire } from 'module';
  import fs   from 'fs';
  import path from 'path';
  import { log }    from '../utils/logger.js';
  import { config } from '../config/index.js';

  const _req = createRequire(import.meta.url);

  // ── MIME helpers ──────────────────────────────────────────────────────────────

  const EXT_MAP = {
    // Images
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
    // Video
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm',
    // Audio
    mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg; codecs=opus',
    m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
    // Documents
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip:  'application/zip',
    txt:  'text/plain',
  };

  /**
   * guessMime(filename) → string
   * Returns a MIME type inferred from the file extension.
   * Falls back to 'application/octet-stream'.
   */
  export function guessMime(filename) {
    const ext = (filename ?? '').split('.').pop()?.toLowerCase() ?? '';
    return EXT_MAP[ext] ?? 'application/octet-stream';
  }

  /**
   * mediaType(mimeType) → 'image' | 'video' | 'audio' | 'document' | 'sticker'
   * Infers the baileys content key from a MIME type string.
   */
  export function mediaType(mimeType) {
    if (!mimeType) return 'document';
    if (mimeType === 'image/webp')       return 'sticker';
    if (mimeType.startsWith('image/'))   return 'image';
    if (mimeType.startsWith('video/'))   return 'video';
    if (mimeType.startsWith('audio/'))   return 'audio';
    return 'document';
  }

  // ── Send helpers ──────────────────────────────────────────────────────────────

  /**
   * sendImage(sock, jid, source, opts?) → Promise<void>
   *
   * @param {Buffer|string} source — Buffer, local path, or HTTPS URL
   * @param {{ caption?, quoted?, mimetype? }} [opts]
   */
  export async function sendImage(sock, jid, source, opts = {}) {
    const content = {
      image:    Buffer.isBuffer(source) ? source : { url: source },
      caption:  opts.caption  ?? undefined,
      mimetype: opts.mimetype ?? 'image/jpeg',
    };
    await sock.sendMessage(jid, content, opts.quoted ? { quoted: opts.quoted } : {});
  }

  /**
   * sendVideo(sock, jid, source, opts?) → Promise<void>
   *
   * @param {{ caption?, quoted?, mimetype?, gif?, ptv? }} [opts]
   *   ptv=true  → sends as video note (view-once circle)
   *   gif=true  → sends as GIF (auto-play, no controls)
   */
  export async function sendVideo(sock, jid, source, opts = {}) {
    const content = {
      video:       Buffer.isBuffer(source) ? source : { url: source },
      caption:     opts.caption  ?? undefined,
      mimetype:    opts.mimetype ?? 'video/mp4',
      gifPlayback: opts.gif      ?? false,
      ptv:         opts.ptv      ?? false,
    };
    await sock.sendMessage(jid, content, opts.quoted ? { quoted: opts.quoted } : {});
  }

  /**
   * sendAudio(sock, jid, source, opts?) → Promise<void>
   *
   * @param {{ quoted?, mimetype?, ptt? }} [opts]
   *   ptt=true → sends as voice note (waveform display)
   */
  export async function sendAudio(sock, jid, source, opts = {}) {
    const content = {
      audio:    Buffer.isBuffer(source) ? source : { url: source },
      mimetype: opts.mimetype ?? 'audio/ogg; codecs=opus',
      ptt:      opts.ptt      ?? false,
    };
    await sock.sendMessage(jid, content, opts.quoted ? { quoted: opts.quoted } : {});
  }

  /**
   * sendDocument(sock, jid, source, opts?) → Promise<void>
   *
   * @param {{ fileName?, caption?, quoted?, mimetype? }} [opts]
   */
  export async function sendDocument(sock, jid, source, opts = {}) {
    const filename = opts.fileName ?? 'file';
    const content  = {
      document: Buffer.isBuffer(source) ? source : { url: source },
      fileName: filename,
      mimetype: opts.mimetype ?? guessMime(filename),
      caption:  opts.caption  ?? undefined,
    };
    await sock.sendMessage(jid, content, opts.quoted ? { quoted: opts.quoted } : {});
  }

  /**
   * sendSticker(sock, jid, source, opts?) → Promise<void>
   *
   * @param {{ quoted?, animated? }} [opts]
   */
  export async function sendSticker(sock, jid, source, opts = {}) {
    const content = {
      sticker:    Buffer.isBuffer(source) ? source : { url: source },
      mimetype:   'image/webp',
      isAnimated: opts.animated ?? false,
    };
    await sock.sendMessage(jid, content, opts.quoted ? { quoted: opts.quoted } : {});
  }

  /**
   * sendMediaAuto(sock, jid, buffer, mimeType, opts?) → Promise<void>
   *
   * Detects the correct sender from the MIME type and dispatches.
   * Useful when you have a buffer but don't know the type statically.
   */
  export async function sendMediaAuto(sock, jid, buffer, mimeType, opts = {}) {
    const type = mediaType(mimeType);
    switch (type) {
      case 'image':   return sendImage(sock, jid, buffer, { ...opts, mimetype: mimeType });
      case 'video':   return sendVideo(sock, jid, buffer, { ...opts, mimetype: mimeType });
      case 'audio':   return sendAudio(sock, jid, buffer, { ...opts, mimetype: mimeType });
      case 'sticker': return sendSticker(sock, jid, buffer, opts);
      default:        return sendDocument(sock, jid, buffer, { ...opts, mimetype: mimeType });
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────────

  /**
   * downloadMedia(msg, savePath?) → Promise<Buffer>
   *
   * Download media from an incoming WhatsApp message.
   * Optionally writes to savePath at the same time.
   *
   * @param {object} msg       — raw WAMessage containing media
   * @param {string} [savePath] — local path to write the file to
   */
  export async function downloadMedia(msg, savePath) {
    let downloadMediaMessage;
    try {
      ({ downloadMediaMessage } = _req('baileys'));
    } catch (e) {
      throw new Error(`[media] Failed to load baileys: ${e.message}`);
    }

    try {
      log.debug(`[media] Downloading media from ${msg?.key?.id}`);
      const buffer = await downloadMediaMessage(msg, 'buffer', {});

      if (savePath) {
        await fs.promises.mkdir(path.dirname(path.resolve(savePath)), { recursive: true });
        await fs.promises.writeFile(savePath, buffer);
        log.debug(`[media] Saved to ${savePath}`);
      }

      return buffer;
    } catch (e) {
      log.error(`[media] Download failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * downloadToTemp(msg, extension?) → Promise<{ filePath: string, buffer: Buffer }>
   *
   * Download media to the configured temp directory.
   * Returns the local file path and the buffer.
   */
  export async function downloadToTemp(msg, extension = 'bin') {
    const id       = msg?.key?.id?.slice(-8) ?? 'media';
    const filename = `${Date.now()}_${id}.${extension}`;
    const filePath = path.join(config.tempDir, filename);
    const buffer   = await downloadMedia(msg, filePath);
    return { filePath, buffer };
  }

  // ── MediaService bundle ───────────────────────────────────────────────────────

  export const MediaService = {
    sendImage,
    sendVideo,
    sendAudio,
    sendDocument,
    sendSticker,
    sendMediaAuto,
    downloadMedia,
    downloadToTemp,
    guessMime,
    mediaType,
  };
  