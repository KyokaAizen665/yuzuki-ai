import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __d = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__d, '../../.env') });
const num  = (v,d) => { const n=parseInt(v,10); return Number.isFinite(n)?n:d; };
const bool = (v,d) => v==='true'?true:v==='false'?false:d;
export const config = Object.freeze({
  ownerNumber:          process.env.OWNER_NUMBER?.replace(/\D/g,'')??\'\',
  botName:              process.env.BOT_NAME     ??'Yuzuki AI',
  prefix:               process.env.PREFIX       ??'.',
  version:              process.env.VERSION      ??'2.0.0',
  autoRead:             bool(process.env.AUTO_READ,false),
  autoTyping:           bool(process.env.AUTO_TYPING,false),
  autoRecording:        bool(process.env.AUTO_RECORDING,false),
  publicMode:           bool(process.env.PUBLIC_MODE,true),
  groqApiKey:           process.env.GROQ_API_KEY??'',
  groqModel:            process.env.GROQ_MODEL??'llama-3.3-70b-versatile',
  sessionDir:           process.env.SESSION_DIR??'./session',
  dbPath:               process.env.DB_PATH??'./database.sqlite',
  tempDir:              process.env.TEMP_DIR??'./temp',
  logsDir:              process.env.LOGS_DIR??'./logs',
  port:                 num(process.env.PORT,3000),
  maxReconnectAttempts: num(process.env.MAX_RECONNECT,10),
  reconnectDelay:       num(process.env.RECONNECT_DELAY,5000),
  debug:                bool(process.env.DEBUG,false),
});
