/**
 * OpenAI Provider
 * Get a key: https://platform.openai.com/api-keys
 *
 * Models: gpt-4o-mini (cheapest), gpt-4o, gpt-3.5-turbo
 * Note: gpt-4o-mini has an extremely generous free tier on new accounts.
 */
export const meta = {
  name:         'openai',
  displayName:  'OpenAI',
  free:         false,
  requiresKey:  true,
  envKey:       'OPENAI_API_KEY',
  defaultModel: 'gpt-4o-mini',
  models:       ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'gpt-4-turbo'],
};

const URL = 'https://api.openai.com/v1/chat/completions';

export async function generate(messages, opts = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch(URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       opts.model       ?? (process.env.OPENAI_MODEL ?? meta.defaultModel),
      messages,
      max_tokens:  opts.maxTokens   ?? 1024,
      temperature: opts.temperature ?? 0.75,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI: ${data?.error?.message ?? `HTTP ${res.status}`}`);

  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('OpenAI: empty response');

  return {
    text,
    tokens:   data.usage?.total_tokens ?? 0,
    model:    data.model ?? meta.defaultModel,
    provider: meta.name,
  };
}

export async function isAvailable() {
  return !!process.env.OPENAI_API_KEY;
}
