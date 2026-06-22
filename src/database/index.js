import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema.js';
import { log } from '../utils/logger.js';
let _db=null;
export function initDatabase(dbPath){if(_db){log.warn('[db] Already init');return _db;}_db=new DatabaseSync(dbPath);_db.exec(SCHEMA_SQL);log.db(`[db] Initialized: ${dbPath}`);return _db;}
export function getDatabase(){if(!_db)throw new Error('[db] Not initialized');return _db;}
export * from './store.js';
