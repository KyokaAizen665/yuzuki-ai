export const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous  = NORMAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_keys  (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (jid TEXT PRIMARY KEY, pushName TEXT,
    isOwner INTEGER NOT NULL DEFAULT 0, isPremium INTEGER NOT NULL DEFAULT 0,
    isBanned INTEGER NOT NULL DEFAULT 0, commandCount INTEGER NOT NULL DEFAULT 0,
    lastSeen TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_users_banned ON users (isBanned);
  CREATE TABLE IF NOT EXISTS groups (jid TEXT PRIMARY KEY, name TEXT, description TEXT, ownerJid TEXT,
    participantCount INTEGER NOT NULL DEFAULT 0, isLocked INTEGER NOT NULL DEFAULT 0,
    welcomeEnabled INTEGER NOT NULL DEFAULT 0, welcomeMsg TEXT,
    goodbyeEnabled INTEGER NOT NULL DEFAULT 0, goodbyeMsg TEXT,
    antilinkEnabled INTEGER NOT NULL DEFAULT 0, antispamEnabled INTEGER NOT NULL DEFAULT 0,
    nsfw INTEGER NOT NULL DEFAULT 0, settings TEXT,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS settings   (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS stats      (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS plugin_data(plugin TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(plugin,key));
  CREATE TABLE IF NOT EXISTS warns      (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, groupJid TEXT NOT NULL, reason TEXT, givenBy TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_warns ON warns(jid,groupJid);
  CREATE TABLE IF NOT EXISTS ai_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chatJid   TEXT    NOT NULL,
    senderJid TEXT,
    role      TEXT    NOT NULL CHECK(role IN ('system','user','assistant')),
    content   TEXT    NOT NULL,
    tokens    INTEGER,
    createdAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_ai_history ON ai_history (chatJid, createdAt);
  CREATE TABLE IF NOT EXISTS ai_memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    memoryType TEXT    NOT NULL CHECK(memoryType IN ('user','chat','global')),
    ownerJid   TEXT,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5,
    expiresAt  TEXT,
    createdAt  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(memoryType, ownerJid, key)
  );
  CREATE INDEX IF NOT EXISTS idx_ai_memory ON ai_memory (memoryType, ownerJid);
`;
