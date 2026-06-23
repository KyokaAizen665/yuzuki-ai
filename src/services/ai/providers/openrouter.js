/**
 * OpenRouter Provider — Free models available (no charge for :free models)
 * Get a free key: https://openrouter.ai
 *
 * Free models (append :free):
 *   meta-llama/llama-3.1-8b-instruct:free
 *   google/gemma-2-9b-it:free
 *   mistralai/mistral-7b-instruct:free
 *   microsoft/phi-3-mini-128k-instruct:free
 *   deepseek/deepseek-r1:free
 */
export const meta = {
  name:         'openrouter',
  displayName:  'OpenRouter (Free models)',
  free:         true,
  requiresKey:  true,
  envKey:       'OPENROUTER_API_KEY',
  defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
  models: [
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'microsoft/phi-3-mini-128k-instruct:free',
    'deepseek/deepseek-r1:free',
    'qwen/qwen-2-7b-instruct:free',
  ],
};

const URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function generate(messages, opts = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch(URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://github.com/KyokaAizen665/Yuzuki-ai',
      'X-Title':       'Yuzuki AI',
    },
    body: JSON.stringify({
      model:       opts.model       ?? meta.defaultModel,
      messages,
      max_tokens:  opts.maxTokens   ?? 1024,
      temperature: opts.temperature ?? 0.75,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`OpenRouter: ${data?.error?.message ?? `HTTP ${res.status}`}`);

  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('OpenRouter: empty response');

  return {
    text,
    tokens:   data.usage?.total_tokens ?? 0,
    model:    data.model ?? meta.defaultModel,
    provider: meta.name,
  };
}

export async function isAvailable() {
  return !!process.env.OPENROUTER_API_KEY;
}
