/**
 * Connection Manager — pairing code auth, exponential backoff reconnection.
 *
 * Pairing code flow (fixed):
 *   1. createSocket() → socket created
 *   2. Immediately check !authState.creds.registered
 *   3. Request pairing code (Baileys requires this BEFORE connection opens)
 *   4. User enters code → connection reaches 'open'
 *
 * Previous bug: pairing code was requested inside connection==='open', which
 * never fires until AFTER the code is entered — a deadlock.
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

  // Notify caller so event handlers (registry, services) can be wired up
  if (_ready) try { _ready(_sock); } catch (e) { log.error(`[conn] onReady: ${e.message}`); }

  _sock.ev.on('creds.update', async () => await _save());
  _sock.ev.on('connection.update', async u => await _handle(u, version));

  // ── Pairing code — must be requested BEFORE connection opens ──────────────
  // Baileys signals an unpaired session via creds.registered === false.
  // We fire this immediately after socket creation; Baileys queues the request
  // and sends it during the initial WS handshake. connection==='open' fires
  // only AFTER the user enters the code, so it cannot be used here.
  if (!_auth.creds.registered && !_pairing) {
    _pairing = true;
    try {
      const phone = config.ownerNumber || await promptPhoneNumber();
      const code  = await requestPairingCode(_sock, phone);
      displayPairingCode(code, phone);
    } catch (e) {
      log.error(`[pairing] ${e.message}`);
      _pairing = false;
    }
  }
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
  if (qr) log.warn('[conn] Unexpected QR — ensure OWNER_NUMBER is set and pairing code was requested');

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
      case DisconnectReason.loggedOut:           log.error('[auth] Logged out');   _clear(); _sched(version, 3000);  break;
      case DisconnectReason.badSession:          log.error('[auth] Bad session');  _clear(); _sched(version, 5000);  break;
      case DisconnectReason.restartRequired:     log.info('[conn] Restart req');             _sched(version, 0);     break;
      case DisconnectReason.connectionReplaced:  log.warn('[conn] Replaced');                _sched(version, 10000); break;
      case DisconnectReason.timedOut:            log.warn('[conn] Timeout');                 _sched(version);        break;
      default:
        if (code !== DisconnectReason.loggedOut && !_down) _sched(version);
        else log.error('[conn] Non-recoverable');
    }
  }
}
