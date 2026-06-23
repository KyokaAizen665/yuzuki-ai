/**
 * Google Gemini Provider — Free tier
 * Get a free key: https://aistudio.google.com
 * Free models: gemini-2.0-flash-lite, gemini-1.5-flash, gemini-1.5-flash-8b
 */
export const meta = {
  name:         'gemini',
  displayName:  'Google Gemini (Free tier)',
  free:         true,
  requiresKey:  true,
  envKey:       'GEMINI_API_KEY',
  defaultModel: 'gemini-2.0-flash-lite',
  models:       ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'],
};

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function generate(messages, opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const model = opts.model ?? meta.defaultModel;

  // Split system prompt from conversation
  const sysMsg  = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  // Gemini requires alternating user/model turns — merge consecutive same-role messages
  const contents = [];
  for (const m of chatMsgs) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += '\n' + m.content;
    } else {
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }

  // Gemini requires first turn to be 'user'
  if (contents.length && contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '.' }] });
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxTokens   ?? 1024,
      temperature:     opts.temperature ?? 0.75,
    },
  };
  if (sysMsg) {
    body.systemInstruction = { parts: [{ text: sysMsg.content }] };
  }

  const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini: ${data?.error?.message ?? `HTTP ${res.status}`}`);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`Gemini: empty response (finishReason: ${reason})`);
  }

  const tokens =
    (data.usageMetadata?.promptTokenCount     ?? 0) +
    (data.usageMetadata?.candidatesTokenCount ?? 0);

  return { text, tokens, model, provider: meta.name };
}

export async function isAvailable() {
  return !!process.env.GEMINI_API_KEY;
}
