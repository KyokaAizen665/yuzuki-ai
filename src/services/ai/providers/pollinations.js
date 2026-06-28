/**
 * Pollinations.ai Provider — free, zero API key required
 * https://pollinations.ai
 *
 * Uses the OpenAI-compatible endpoint from Pollinations.
 * Falls back to an alternate endpoint if the primary one is down.
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

// Primary and fallback endpoints
const ENDPOINTS = [
  'https://text.pollinations.ai/openai',
  'https://api.pollinations.ai/v1/chat/completions',
];

async function tryEndpoint(url, payload, timeoutMs) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(timeoutMs),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const errMsg = data?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Pollinations: ${errMsg}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Pollinations: empty response');

  return {
    text,
    tokens:   data.usage?.total_tokens ?? 0,
    model:    data.model ?? meta.defaultModel,
    provider: meta.name,
  };
}

export async function generate(messages, opts = {}) {
  const payload = {
    model:       opts.model       ?? meta.defaultModel,
    messages,
    max_tokens:  opts.maxTokens   ?? 1024,
    temperature: opts.temperature ?? 0.75,
    seed:        Math.floor(Math.random() * 999_999),
  };

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const errors    = [];

  for (const url of ENDPOINTS) {
    try {
      return await tryEndpoint(url, payload, timeoutMs);
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }

  throw new Error(`Pollinations failed: ${errors.join(' | ')}`);
}

export async function isAvailable() {
  // Always available — no key check needed.
  // Runtime failures are handled by AIManager's fallback chain.
  return true;
}
