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
  aiProvider:           process.env.AI_PROVIDER        ?? 'auto',
  aiFallbackChain:      process.env.AI_FALLBACK_CHAIN  ?? '',

  // Groq — free tier: https://console.groq.com
  groqApiKey:           process.env.GROQ_API_KEY        ?? '',
  groqModel:            process.env.GROQ_MODEL          ?? 'llama-3.3-70b-versatile',

  // Google Gemini — free tier: https://aistudio.google.com
  geminiApiKey:         process.env.GEMINI_API_KEY      ?? '',
  geminiModel:          process.env.GEMINI_MODEL        ?? 'gemini-2.0-flash-lite',

  // OpenRouter — free models: https://openrouter.ai
  openrouterApiKey:     process.env.OPENROUTER_API_KEY  ?? '',
  openrouterModel:      process.env.OPENROUTER_MODEL    ?? 'meta-llama/llama-3.1-8b-instruct:free',

  // OpenAI: https://platform.openai.com/api-keys
  openaiApiKey:         process.env.OPENAI_API_KEY      ?? '',
  openaiModel:          process.env.OPENAI_MODEL        ?? 'gpt-4o-mini',

  // Puter — free credits: https://puter.com → dev-center → API Keys
  puterApiKey:          process.env.PUTER_API_KEY       ?? '',
  puterModel:           process.env.PUTER_MODEL         ?? 'gpt-4o-mini',

  // Pollinations — no API key required (always available as fallback)
  pollinationsModel:    process.env.POLLINATIONS_MODEL  ?? 'openai-large',

  // ── Hero pool ─────────────────────────────────────────────────────────────
  // MENU_HERO_MODE: random (default) | static
  // MENU_HERO_IMAGE: filename within assets/heroes/ used when mode=static
  menuHeroMode:         process.env.MENU_HERO_MODE  ?? 'random',
  menuHeroImage:        process.env.MENU_HERO_IMAGE ?? '',

  // ── Branding / channel ───────────────────────────────────────────────────
  officialChannelJid:   process.env.OFFICIAL_CHANNEL_JID ?? '',
  officialChannelUrl:   process.env.OFFICIAL_CHANNEL_URL ?? '',

  // ── Menu offer overlay ───────────────────────────────────────────────────
  // MENU_OFFER_TEXT   — offer body text (leave empty = no offer card shown)
  // MENU_OFFER_URL    — tap destination URL
  // MENU_OFFER_CODE   — promo code shown on the card
  // MENU_OFFER_EXPIRY — Unix timestamp in SECONDS (e.g. 1785427200 = Jul 30 2026)
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

  // ── Lab flags ────────────────────────────────────────────────────────────
  // LAB_COMMERCE_MODE=true  unlocks .teststorefront/.testcollection/etc.
  // Never set this in production — lab commands send raw proto payloads.
  labCommerceMode:      bool(process.env.LAB_COMMERCE_MODE, false),
});