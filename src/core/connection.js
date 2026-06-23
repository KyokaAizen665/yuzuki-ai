/**
 * Connection Manager
 *
 * Pairing code flow (correct timing):
 *   1. createSocket() — printQRInTerminal: false
 *   2. Baileys connects to WA servers
 *   3. WA sends a QR challenge → connection.update fires with { qr }
 *   4. At that point the WebSocket is ready → call requestPairingCode()
 *   5. User enters the 8-char code in WhatsApp
 *   6. connection.update fires with { connection: 'open' }
 *
 * Disconnect handling:
 *   - 401 while not yet paired (creds.registered=false) → pairing expired,
 *     request a new code on next connection (do NOT wipe session)
 *   - 401 while paired (creds.registered=true) → actual logout → clear session
 *   - 500 → bad/corrupt session → clear and restart
 *   - 515 → restart required → reconnect immediately
 *   - 428 → connection replaced (multi-device conflict) → back off 10 s
 *   - 408 → connection timeout → standard backoff
 *
 * Disconnect codes: 401=logout/pairingExpiry 500=badSession 515=restart
 *                   428=replaced 408=timeout
 */
import { createRequire } from 'module';
const _req = createRequire(import.meta.url);
const { DisconnectReason } = _req('baileys');
import { config }  from '../config/index.js';
import { log }     from '../utils/logger.js';
import { createSocket } from './socket.js';
import { requestPairingCode, displayPairingCode, promptPhoneNumber } from './pairing.js';

// ── State ─────────────────────────────────────────────────────────────────────

let _sock    = null;
let _att     = 0;       // reconnect attempt counter
let _pairing = false;   // true while a pairing request is in-flight
let _down    = false;   // true after shutdown() called
let _timer   = null;    // reconnect timer handle

let _auth  = null;      // Baileys auth state object { creds, keys }
let _save  = null;      // saveCreds()
let _clear = null;      // clearCreds()
let _ready = null;      // onSocketReady(sock)

// ── Public API ────────────────────────────────────────────────────────────────

export function initConnectionManager({ authState, saveCreds, clearCreds, onSocketReady }) {
  _auth  = authState;
  _save  = saveCreds;
  _clear = clearCreds;
  _ready = onSocketReady;
}

export const getSocket = () => _sock;

export function shutdown() {
  _down = true;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  if (_sock)  { try { _sock.end(undefined); } catch {} _sock = null; }
  log.info('[conn] Shutdown complete');
}

export async function connect(version) {
  if (_down) return;
  if (!_auth) throw new Error('[conn] Call initConnectionManager() before connect()');

  log.startup(`[conn] Connecting (attempt ${_att + 1})...`);
  _sock = createSocket({ version, authState: _auth });

  // Wire up Phase 2/5 event handlers
  if (_ready) {
    try { _ready(_sock); }
    catch (e) { log.error(`[conn] onSocketReady callback failed: ${e.message}`); }
  }

  _sock.ev.on('creds.update', async () => { try { await _save(); } catch {} });
  _sock.ev.on('connection.update', async u => await _handle(u, version));
  // Note: requestPairingCode() is called inside _handle() when {qr} is received,
  // NOT here — the WebSocket must be established first.
}

// ── Internal ──────────────────────────────────────────────────────────────────

const _jitter  = () => Math.floor(Math.random() * 2000);
const _backoff = attempt =>
  Math.min(config.reconnectDelay * Math.pow(2, attempt) + _jitter(), 60_000);

function _maxReconnect() {
  // 0 = unlimited (useful on Pterodactyl/VPS where the process manager restarts)
  return config.maxReconnectAttempts === 0 ? Infinity : config.maxReconnectAttempts;
}

function _sched(version, overrideDelayMs) {
  if (_down) return;

  _att++;
  if (_att > _maxReconnect()) {
    log.error(`[conn] Reached max reconnect attempts (${config.maxReconnectAttempts}) — exiting`);
    log.error('[conn] Tip: set MAX_RECONNECT=0 for unlimited retries, or use a process manager (PM2 / Pterodactyl auto-restart)');
    process.exit(1);
  }

  const delay = overrideDelayMs !== undefined ? overrideDelayMs : _backoff(_att - 1);
  log.warn(`[conn] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${_att}/${config.maxReconnectAttempts === 0 ? '∞' : config.maxReconnectAttempts})`);

  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(async () => {
    _timer = null;
    if (_sock) { try { _sock.end(undefined); } catch {} _sock = null; }
    await connect(version);
  }, delay);
}

async function _handle({ connection, lastDisconnect, isNewLogin, qr }, version) {
  // ── Pairing code ─────────────────────────────────────────────────────────
  // Trigger: WhatsApp sends {qr} when the WS is ready for auth.
  // We intercept it and request a pairing code instead of displaying the QR.
  if (qr && !_auth.creds.registered && !_pairing) {
    _pairing = true;
    log.info('[conn] WS ready — requesting pairing code (QR suppressed)');
    try {
      const phone = config.ownerNumber || promptPhoneNumber(); // promptPhoneNumber throws on headless
      const code  = await requestPairingCode(_sock, phone);
      displayPairingCode(code, phone);
    } catch (e) {
      log.error(`[pairing] ${e.message}`);
      if (e.message.includes('OWNER_NUMBER')) {
        log.error('[pairing] Fatal: cannot pair without OWNER_NUMBER on a headless server — exiting');
        process.exit(1);
      }
      // Non-fatal pairing failure (e.g. WA server error): reset and retry on reconnect
      _pairing = false;
    }
  }

  // ── Connection state transitions ─────────────────────────────────────────
  if (connection === 'connecting') {
    log.info('[conn] Establishing connection...');
  }

  if (isNewLogin) {
    log.success('[auth] New login confirmed — session established');
    _pairing = false;
    _att     = 0;
  }

  if (connection === 'open') {
    _att     = 0;
    _pairing = false;
    log.success(`[conn] ✅ Connected as ${_sock?.user?.id ?? '?'}`);
  }

  if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode;
    const msg  = lastDisconnect?.error?.message ?? 'unknown';
    _pairing   = false;

    log.warn(`[conn] Connection closed — code=${code ?? 'none'} reason="${msg}"`);

    switch (code) {
      case DisconnectReason.loggedOut:
        if (_auth.creds.registered) {
          // Genuine logout (user removed the device from WhatsApp)
          log.error('[auth] Logged out — session cleared. Re-pair to reconnect.');
          _clear();
          _sched(version, 5000);
        } else {
          // Pairing code expired before the user entered it
          log.warn('[pairing] Pairing code expired or rejected — will request a new one');
          _clear(); // clear partial session so Baileys generates a fresh challenge
          _sched(version, 3000);
        }
        break;

      case DisconnectReason.badSession:
        log.error('[auth] Bad/corrupt session — clearing and reconnecting');
        _clear();
        _sched(version, 5000);
        break;

      case DisconnectReason.restartRequired:
        log.info('[conn] Server requested restart — reconnecting immediately');
        _sched(version, 0);
        break;

      case DisconnectReason.connectionReplaced:
        log.warn('[conn] Connection replaced (another instance connected) — backing off 15 s');
        _sched(version, 15_000);
        break;

      case DisconnectReason.timedOut:
        log.warn('[conn] Connection timed out — reconnecting with backoff');
        _sched(version);
        break;

      default:
        if (!_down) {
          log.warn(`[conn] Unexpected close (code=${code}) — reconnecting with backoff`);
          _sched(version);
        } else {
          log.info('[conn] Closed cleanly during shutdown');
        }
    }
  }
}
