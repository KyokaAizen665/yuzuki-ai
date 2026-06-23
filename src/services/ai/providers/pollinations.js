/**
 * Pollinations.ai Provider — 100% FREE, zero API key required!
 * https://pollinations.ai — No registration, no cost, no rate limits enforced
 *
 * This is the zero-key fallback provider — always available.
 * Uses the OpenAI-compatible endpoint from Pollinations.
 *
 * Available models (free, no key):
 *   openai-large  — GPT-4o equivalent
 *   openai        — GPT-4o mini equivalent
 *   mistral       — Mistral 7B
 *   mistral-large — Mistral Large
 *   deepseek      — DeepSeek-R1
 */
export const meta = {
  name:         'pollinations',
  displayName:  'Pollinations.ai (Free, No Key)',
  free:         true,
  requiresKey:  false,
  envKey:       null,
  defaultModel: 'openai-large',
  models:       ['openai-large', 'openai', 'mistral', 'mistral-large', 'deepseek'],
};

const URL = 'https://text.pollinations.ai/openai';

export async function generate(messages, opts = {}) {
  const res = await fetch(URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      model:       opts.model       ?? meta.defaultModel,
      messages,
      max_tokens:  opts.maxTokens   ?? 1024,
      temperature: opts.temperature ?? 0.75,
      seed:        Math.floor(Math.random() * 999_999),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Pollinations: ${data?.error?.message ?? `HTTP ${res.status}`}`);

  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Pollinations: empty response');

  return {
    text,
    tokens:   data.usage?.total_tokens ?? 0,
    model:    data.model ?? meta.defaultModel,
    provider: meta.name,
  };
}

export async function isAvailable() {
  return true; // Always available — no key needed
}
