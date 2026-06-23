/**
 * Pairing Code Authentication
 *
 * Headless-server safe — never blocks on stdin.
 * On VPS / Pterodactyl: set OWNER_NUMBER in env; the code prints to stdout
 * so it appears in the Pterodactyl console and any log aggregator.
 *
 * Steps:
 *   WhatsApp → Settings → Linked Devices → Link a Device
 *   → "Link with phone number instead" → Enter 8-char code
 */
import fs   from 'fs';
import path from 'path';
import { log }    from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * promptPhoneNumber() — never call on a headless server.
 *
 * On VPS / Pterodactyl, stdin is not a TTY; readline would hang forever.
 * Instead we throw immediately so the operator sees a clear startup error.
 *
 * To fix: set OWNER_NUMBER in your .env / Pterodactyl egg variables.
 */
export function promptPhoneNumber() {
  throw new Error(
    'OWNER_NUMBER is not set.\n' +
    '  On a VPS or Pterodactyl server, set OWNER_NUMBER in your environment\n' +
    '  variables or .env file (digits only, include country code, no +).\n' +
    '  Example: OWNER_NUMBER=233533416608\n' +
    '  The bot cannot prompt interactively on a headless server.',
  );
}

/**
 * requestPairingCode(sock, phone) → Promise<string>
 *
 * Requests an 8-character pairing code from WhatsApp.
 * Must be called AFTER the QR challenge fires (WebSocket is ready).
 * Throws a descriptive error so the caller can log and retry.
 *
 * @param {object} sock  — Baileys socket
 * @param {string} phone — digits only, country code included (e.g. "233533416608")
 */
export async function requestPairingCode(sock, phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new Error(`Invalid phone number "${phone}" — expected 7–15 digits including country code`);
  }

  log.auth(`[pairing] Requesting code for +${digits}...`);
  try {
    const code = await sock.requestPairingCode(digits);
    return String(code).trim();
  } catch (e) {
    throw new Error(`Pairing code request failed: ${e.message}`);
  }
}

/**
 * displayPairingCode(code, phone) → void
 *
 * Prints the pairing code in a prominent banner.
 * Outputs to both the structured logger (log files, Pterodactyl console)
 * and raw stdout (for minimal environments without a logger).
 *
 * The code is also written to <logsDir>/pairing-code.txt so operators
 * can retrieve it even if they miss the console output.
 */
export function displayPairingCode(code, phone) {
  const line = '════════════════════════════════════════════════';
  const codeStr  = String(code).toUpperCase().trim();
  const phoneStr = `+${phone.replace(/\D/g, '')}`;

  const banner = [
    '',
    `  ${line}`,
    '  ║        WHATSAPP PAIRING CODE                 ║',
    `  ${line}`,
    `  ║   Code  : ${codeStr.padEnd(37)}║`,
    `  ║   Phone : ${phoneStr.padEnd(37)}║`,
    `  ${line}`,
    '',
    '  Open WhatsApp on your phone:',
    '  Settings → Linked Devices → Link a Device',
    '  → Tap "Link with phone number instead"',
    `  → Enter code: ${codeStr}`,
    '',
    '  Code expires in ~60 seconds. A new one will be',
    '  requested automatically if it expires.',
    '',
  ].join('\n');

  // Raw stdout — always visible even if logger is silent
  process.stdout.write(banner);

  // Structured logger — appears in Pterodactyl console + log files
  log.auth(`[pairing] ✅ Code: ${codeStr}  Phone: ${phoneStr}`);

  // Write to file for late retrieval
  _savePairingCodeToFile(codeStr, phoneStr);
}

/** Write code to a file for retrieval if console was missed */
function _savePairingCodeToFile(code, phone) {
  try {
    const logsDir = config.logsDir ?? './logs';
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const target = path.join(logsDir, 'pairing-code.txt');
    const ts     = new Date().toISOString();
    fs.writeFileSync(target,
      `Yuzuki AI — Pairing Code\n` +
      `Generated : ${ts}\n` +
      `Phone     : ${phone}\n` +
      `Code      : ${code}\n` +
      `\nEnter this code in WhatsApp:\n` +
      `Settings → Linked Devices → Link a Device → Link with phone number instead\n`,
    );
    log.info(`[pairing] Code also saved to ${target}`);
  } catch (e) {
    log.warn(`[pairing] Could not save code to file: ${e.message}`);
  }
}
