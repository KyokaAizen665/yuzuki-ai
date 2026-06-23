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

  // ── AI providers (Phase 6) ───────────────────────────────────────────────
  // Preferred provider: auto | groq | gemini | openrouter | pollinations
  aiProvider:           process.env.AI_PROVIDER        ?? 'auto',
  // Comma-separated fallback order (overrides default chain)
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

  // Pollinations — no API key required (always available as fallback)
  pollinationsModel:    process.env.POLLINATIONS_MODEL  ?? 'openai-large',

  // ── Branding / channel ───────────────────────────────────────────────────
  officialChannelJid:   process.env.OFFICIAL_CHANNEL_JID ?? '',
  officialChannelUrl:   process.env.OFFICIAL_CHANNEL_URL ?? '',

  // ── Menu offer overlay ───────────────────────────────────────────────────
  // Renders as the native WhatsApp offer card (tag icon, title, expiry, code).
  // cv3inx API: offerText / offerUrl / offerCode / offerExpiration.
  // Leave MENU_OFFER_TEXT empty (or unset) to disable the offer card entirely.
  //
  // Usage examples (.env):
  //   # Announcement
  //   MENU_OFFER_TEXT=📢 Yuzuki AI v2.1 — now with GPT-4o
  //
  //   # Promotion with promo code + 30-day expiry
  //   MENU_OFFER_TEXT=🎁 Premium — 30 % off this week
  //   MENU_OFFER_CODE=YUZUKI30
  //   MENU_OFFER_EXPIRY=1785427200
  //
  //   # Maintenance notice
  //   MENU_OFFER_TEXT=🔧 Scheduled maintenance: Jul 14, 02:00–04:00 UTC
  //
  // MENU_OFFER_URL   — optional tap URL (leave empty for pure text card)
  // MENU_OFFER_CODE  — optional copy/promo code shown as "Code: …"
  // MENU_OFFER_EXPIRY — optional unix timestamp (seconds) shown as "Ends on …"
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
