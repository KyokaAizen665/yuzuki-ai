/**
 * Groq Provider — Free tier (fast LLaMA inference)
 * Get a free key: https://console.groq.com
 */
export const meta = {
  name:         'groq',
  displayName:  'Groq (LLaMA 3.3 70B)',
  free:         true,
  requiresKey:  true,
  envKey:       'GROQ_API_KEY',
  defaultModel: 'llama-3.3-70b-versatile',
  models:       ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768'],
};

const URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function generate(messages, opts = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const res = await fetch(URL, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      model:       opts.model       ?? meta.defaultModel,
      messages,
      max_tokens:  opts.maxTokens   ?? 1024,
      temperature: opts.temperature ?? 0.75,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Groq: ${data?.error?.message ?? `HTTP ${res.status}`}`);

  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Groq: empty response');

  return {
    text,
    tokens:   data.usage?.total_tokens ?? 0,
    model:    data.model ?? meta.defaultModel,
    provider: meta.name,
  };
}

export async function isAvailable() {
  return !!process.env.GROQ_API_KEY;
}
