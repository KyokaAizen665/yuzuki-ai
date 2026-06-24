import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __d = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__d, '../../.env') });
const num  = (v,d) => { const n=parseInt(v,10); return Number.isFinite(n)?n:d; };
const bool = (v,d) => v==='true'?true:v==='false'?false:d;
export const config = Object.freeze({
  // Bot identity
  ownerNumber:          process.env.OWNER_NUMBER?.replace(/\D/g,'')??'',
  botName:              process.env.BOT_NAME     ??'Yuzuki AI',
  prefix:               process.env.PREFIX       ??'.',
  version:              process.env.VERSION      ??'2.0.0',

  // Behaviour
  autoRead:             bool(process.env.AUTO_READ,     false),
  autoTyping:           bool(process.env.AUTO_TYPING,   false),
  autoRecording:        bool(process.env.AUTO_RECORDING,false),
  publicMode:           bool(process.env.PUBLIC_MODE,   true),

  // ── AI providers ─────────────────────────────────────────────────────────
  // AI_PROVIDER: auto | groq | gemini | openrouter | openai | puter | pollinations
  aiProvider:           process.env.AI_PROVIDER        ?? 'auto',
  // AI_FALLBACK_CHAIN: comma-separated priority order, e.g. "groq,gemini,openrouter,puter"
  aiFallbackChain:      process.env.AI_FALLBACK_CHAIN  ?? '',

  // Groq — free tier: https://console.groq.com
  groqApiKey:           process.env.GROQ_API_KEY        ?? '',
  groqModel:            process.env.GROQ_MODEL          ?? 'llama-3.3-70b-versatile',

  // Google Gemini — free tier: https://aistudio.google.com
  geminiApiKey:         process.env.GEMINI_API_KEY      ?? '',
  geminiModel:          process.env.GEMINI_MODEL        ?? 'gemini-2.0-flash-lite',

  // OpenRouter — free models (use :free suffix): https://openrouter.ai
  openrouterApiKey:     process.env.OPENROUTER_API_KEY  ?? '',
  openrouterModel:      process.env.OPENROUTER_MODEL    ?? 'meta-llama/llama-3.1-8b-instruct:free',

  // OpenAI: https://platform.openai.com/api-keys
  openaiApiKey:         process.env.OPENAI_API_KEY      ?? '',
  openaiModel:          process.env.OPENAI_MODEL        ?? 'gpt-4o-mini',

  // Puter — free credits (sign up at https://puter.com, get key from dev-center)
  puterApiKey:          process.env.PUTER_API_KEY       ?? '',
  puterModel:           process.env.PUTER_MODEL         ?? 'gpt-4o-mini',

  // Pollinations — no API key required (always available as fallback)
  pollinationsModel:    process.env.POLLINATIONS_MODEL  ?? 'openai-large',

  // ── Branding / channel ───────────────────────────────────────────────────
  officialChannelJid:   process.env.OFFICIAL_CHANNEL_JID ?? '',
  officialChannelUrl:   process.env.OFFICIAL_CHANNEL_URL ?? '',

  // ── Menu offer overlay ───────────────────────────────────────────────────
  menuOfferText:        process.env.MENU_OFFER_TEXT   ?? '',
  menuOfferUrl:         process.env.MENU_OFFER_URL    ?? '',
  menuOfferCode:        process.env.MENU_OFFER_CODE   ?? '',
  menuOfferExpiry:      process.env.MENU_OFFER_EXPIRY ?? '',

  // ── Paths ────────────────────────────────────────────────────────────────
  sessionDir:           process.env.SESSION_DIR ?? './session',
  dbPath:               process.env.DB_PATH     ?? './database.sqlite',
  tempDir:              process.env.TEMP_DIR    ?? './temp',
  logsDir:              process.env.LOGS_DIR    ?? './logs',

  // ── Network ──────────────────────────────────────────────────────────────
  port:                 num(process.env.PORT,            3000),
  maxReconnectAttempts: num(process.env.MAX_RECONNECT,   10),
  reconnectDelay:       num(process.env.RECONNECT_DELAY, 5000),
  debug:                bool(process.env.DEBUG,          false),
});
