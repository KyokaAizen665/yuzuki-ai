/**
 * SQLite Auth State Adapter
 * Buffer-safe serialization — see utils/buffer.js.
 * Pairing loop guard via hasValidSession().
 */
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'module';
import { serialize, deserialize } from '../utils/buffer.js';
import { log } from '../utils/logger.js';
const _req = createRequire(import.meta.url);
const { initAuthCreds } = _req('baileys');
let _db = null;
function getDb(dbPath) {
  if(_db)return _db;
  _db=new DatabaseSync(dbPath);
  _db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;');
  _db.exec('CREATE TABLE IF NOT EXISTS auth_creds(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
  _db.exec('CREATE TABLE IF NOT EXISTS auth_keys(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
  return _db;
}
export function useSQLiteAuthState(dbPath) {
  const db = getDb(dbPath);
  const loadCreds = () => {
    const r=db.prepare('SELECT data FROM auth_creds WHERE id=?').get('creds');
    if(!r){log.auth('[auth] Fresh session');return initAuthCreds();}
    try{const c=deserialize(r.data);log.auth(`[auth] Restored (jid:${c?.me?.id??'not paired'})`);return c;}
    catch(e){log.warn(`[auth] Corrupt: ${e.message}`);db.prepare('DELETE FROM auth_creds').run();return initAuthCreds();}
  };
  const saveCreds  = async () => { db.prepare('INSERT OR REPLACE INTO auth_creds(id,data) VALUES(?,?)').run('creds',serialize(state.creds)); };
  const clearCreds = () => { db.prepare('DELETE FROM auth_creds').run();db.prepare('DELETE FROM auth_keys').run();state.creds=initAuthCreds();log.auth('[auth] Cleared'); };
  const keys = {
    get: async(type,ids) => { const r={}; for(const id of ids){const row=db.prepare('SELECT data FROM auth_keys WHERE id=?').get(`${type}:${id}`);if(row)try{r[id]=deserialize(row.data);}catch{}}return r; },
    set: async(data) => { const u=db.prepare('INSERT OR REPLACE INTO auth_keys(id,data) VALUES(?,?)');const d=db.prepare('DELETE FROM auth_keys WHERE id=?');for(const[t,m]of Object.entries(data))for(const[id,v]of Object.entries(m))v!=null?u.run(`${t}:${id}`,serialize(v)):d.run(`${t}:${id}`); },
  };
  const state={creds:loadCreds(),keys};
  log.db('[auth] Auth adapter ready');
  return{state,saveCreds,clearCreds};
}
export function hasValidSession(dbPath) {
  try{const db=getDb(dbPath);const r=db.prepare('SELECT data FROM auth_creds WHERE id=?').get('creds');if(!r)return false;const c=deserialize(r.data);return!!(c?.me?.id);}catch{return false;}
}
