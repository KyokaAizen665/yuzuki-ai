/**
 * Connection Manager — pairing code auth, exponential backoff reconnection.
 *
 * Pairing code flow (correct):
 *   1. createSocket() — printQRInTerminal: false
 *   2. Baileys establishes WS → WhatsApp sends QR challenge
 *   3. connection.update fires with { qr: '...' } — WS is now ready
 *   4. At that point call requestPairingCode() INSTEAD of showing the QR
 *   5. User enters code in WhatsApp → connection.update fires with open
 *
 * Bug history:
 *   v1: requestPairingCode() called in connection==='open' handler (deadlock —
 *       open only fires AFTER pairing is complete).
 *   v2: requestPairingCode() called immediately after createSocket() (too early —
 *       WS not yet established, Baileys throws "Connection Closed").
 *   v3 (this): requestPairingCode() called when {qr} arrives in connection.update,
 *       which is the correct signal that the WS is ready for pairing.
 *
 * Disconnect codes: 401=logout 500=badSession 515=restart 428=replaced 408=timeout
 */
import { createRequire } from 'module';
const _req = createRequire(import.meta.url);
const { DisconnectReason } = _req('baileys');
import { config } from '../config/index.js';
import { log }    from '../utils/logger.js';
import { createSocket } from './socket.js';
import { requestPairingCode, displayPairingCode, promptPhoneNumber } from './pairing.js';

let _sock = null, _att = 0, _pairing = false, _down = false, _timer = null;
let _auth = null, _save = null, _clear = null, _ready = null;

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
  log.info('[conn] Down');
}

export async function connect(version) {
  if (_down) return;
  if (!_auth) throw new Error('[conn] Call initConnectionManager first');

  log.startup(`[conn] Connecting (${_att + 1})...`);
  _sock = createSocket({ version, authState: _auth });

  if (_ready) try { _ready(_sock); } catch (e) { log.error(`[conn] onReady: ${e.message}`); }

  _sock.ev.on('creds.update', async () => await _save());
  _sock.ev.on('connection.update', async u => await _handle(u, version));
}

const _delay = a => Math.min(config.reconnectDelay * Math.pow(2, a) + Math.random() * 2000, 60000);

function _sched(version, ov) {
  if (_down) return;
  if (++_att > config.maxReconnectAttempts) {
    log.error('[conn] Max reconnects — exit');
    process.exit(1);
  }
  const d = ov !== undefined ? ov : _delay(_att - 1);
  log.warn(`[conn] Retry in ${(d / 1000).toFixed(1)}s (${_att}/${config.maxReconnectAttempts})`);
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(async () => {
    _timer = null;
    if (_sock) { try { _sock.end(undefined); } catch {} _sock = null; }
    await connect(version);
  }, d);
}

async function _handle({ connection, lastDisconnect, isNewLogin, qr }, version) {
  // ── Pairing code — triggered when WhatsApp sends the QR challenge ──────────
  // Receiving {qr} means the WebSocket is established and the server is waiting
  // for auth. Call requestPairingCode() here INSTEAD of displaying the QR.
  // This is the correct timing — earlier (post-createSocket) the WS isn't ready.
  if (qr && !_auth.creds.registered && !_pairing) {
    _pairing = true;
    log.info('[conn] QR challenge received — requesting pairing code instead');
    try {
      const phone = config.ownerNumber || await promptPhoneNumber();
      const code  = await requestPairingCode(_sock, phone);
      displayPairingCode(code, phone);
    } catch (e) {
      log.error(`[pairing] ${e.message}`);
      _pairing = false;
    }
  }

  if (connection === 'connecting') log.info('[conn] Connecting...');

  if (isNewLogin) {
    log.success('[auth] Login confirmed');
    _pairing = false;
    _att = 0;
  }

  if (connection === 'open') {
    _att     = 0;
    _pairing = false;
    log.success(`[conn] Connected as ${_sock?.user?.id ?? '?'}`);
  }

  if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode;
    const msg  = lastDisconnect?.error?.message ?? '?';
    _pairing = false;
    log.warn(`[conn] Closed code=${code} "${msg}"`);
    switch (code) {
      case DisconnectReason.loggedOut:          log.error('[auth] Logged out');  _clear(); _sched(version, 3000);  break;
      case DisconnectReason.badSession:         log.error('[auth] Bad session'); _clear(); _sched(version, 5000);  break;
      case DisconnectReason.restartRequired:    log.info('[conn] Restart req');            _sched(version, 0);     break;
      case DisconnectReason.connectionReplaced: log.warn('[conn] Replaced');               _sched(version, 10000); break;
      case DisconnectReason.timedOut:           log.warn('[conn] Timeout');                _sched(version);        break;
      default:
        if (code !== DisconnectReason.loggedOut && !_down) _sched(version);
        else log.error('[conn] Non-recoverable');
    }
  }
}
