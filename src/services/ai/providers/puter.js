/**
 * Puter AI Provider — Free tier via Puter cloud platform
 * Sign up free: https://puter.com — generous free AI credits included
 * Get your API key: https://puter.com/app/dev-center (API Keys section)
 *
 * Puter provides access to GPT-4o, Claude, and others through a single key.
 * Free tier includes enough credits for typical bot workloads.
 *
 * Available drivers (models):
 *   gpt-4o-mini   — fastest, cheapest
 *   gpt-4o        — most capable GPT
 *   claude-sonnet — Anthropic Claude Sonnet
 *   claude-haiku  — faster Claude
 *   gemini-flash  — Google Gemini Flash
 */
export const meta = {
  name:         'puter',
  displayName:  'Puter AI (Free Credits)',
  free:         true,
  requiresKey:  true,
  envKey:       'PUTER_API_KEY',
  defaultModel: 'gpt-4o-mini',
  models:       ['gpt-4o-mini', 'gpt-4o', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'gemini-2.0-flash'],
};

const ENDPOINT = 'https://api.puter.com/drivers/call';

export async function generate(messages, opts = {}) {
  const key = process.env.PUTER_API_KEY;
  if (!key) throw new Error('PUTER_API_KEY not set');

  const model = opts.model ?? (process.env.PUTER_MODEL ?? meta.defaultModel);

  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      interface: 'puter-chat-completion',
      driver:    model,
      method:    'complete',
      args: {
        messages,
        max_tokens:  opts.maxTokens   ?? 1024,
        temperature: opts.temperature ?? 0.75,
      },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? `HTTP ${res.status}`;
    throw new Error(`Puter: ${msg}`);
  }

  // Puter wraps the result — support both response shapes
  const result = data?.result ?? data;
  const text =
    result?.message?.content?.trim()             ??  // { message: { content } }
    result?.choices?.[0]?.message?.content?.trim() ?? // OpenAI-compat shape
    '';

  if (!text) throw new Error('Puter: empty response');

  const tokens =
    result?.usage?.total_tokens              ??
    result?.usage?.prompt_tokens             ??
    data?.usage?.total_tokens                ??
    0;

  return {
    text,
    tokens,
    model,
    provider: meta.name,
  };
}

export async function isAvailable() {
  return !!process.env.PUTER_API_KEY;
}
