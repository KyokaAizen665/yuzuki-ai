import { createRequire as _cjsRequire } from 'module';
const _req = _cjsRequire(import.meta.url);
const { default: makeWASocket, Browsers, fetchLatestBaileysVersion } = _req('baileys');
import { pinoLogger } from '../utils/logger.js';
import { isJidBroadcast, isJidStatusBroadcast } from '../utils/jid.js';

/**
 * Socket Factory
 * Creates the Baileys WebSocket with pairing-code-only config.
 * printQRInTerminal is ALWAYS false — pairing code is the only auth method.
 */
export async function getBaileysVersion() {
  try { const { version } = await fetchLatestBaileysVersion(); return version; }
  catch { return [2, 3000, 1015901307]; }
}

export function createSocket({ version, authState }) {
  return makeWASocket({
    version,
    auth:                          authState,
    logger:                        pinoLogger,
    browser:                       Browsers.macOS('Chrome'),
    printQRInTerminal:             false,        // ALWAYS false — pairing code only
    syncFullHistory:               false,
    generateHighQualityLinkPreview: true,
    getMessage:                    async () => ({ conversation: '' }),
    shouldIgnoreJid:               j => isJidBroadcast(j) && !isJidStatusBroadcast(j),
    markOnlineOnConnect:           true,
    keepAliveIntervalMs:           30_000,
  });
}

// ── getBaileys ───────────────────────────────────────────────────────────────
// Lazy singleton — returns the full Baileys module via createRequire so that
// commands (e.g. lab-commerce.js) can access proto helpers without a bare
// 'baileys' specifier in ESM context.
let _baileysMod = null;
export function getBaileys() {
  if (!_baileysMod) _baileysMod = _req('baileys');
  return _baileysMod;
}
