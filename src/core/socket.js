import { createRequire } from 'module';
const _req = createRequire(import.meta.url);
const { default: makeWASocket, Browsers, fetchLatestBaileysVersion } = _req('baileys');
import { pinoLogger } from '../utils/logger.js';
import { isJidBroadcast, isJidStatusBroadcast } from '../utils/jid.js';
export async function getBaileysVersion() {
  try{const{version}=await fetchLatestBaileysVersion();return version;}catch{return[2,3000,1015901307];}
}
export function createSocket({ version, authState }) {
  return makeWASocket({
    version, auth: authState, logger: pinoLogger,
    browser:                        Browsers.macOS('Chrome'),
    printQRInTerminal:              false,
    syncFullHistory:                false,
    generateHighQualityLinkPreview: true,
    getMessage:                     async()=>({conversation:''}),
    shouldIgnoreJid:                j=>isJidBroadcast(j)&&!isJidStatusBroadcast(j),
    markOnlineOnConnect:            true,
    keepAliveIntervalMs:            30_000,
  });
}
