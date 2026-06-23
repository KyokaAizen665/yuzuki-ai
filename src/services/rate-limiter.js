/**
 * Rate Limiter — Phase 5
 *
 * Simple fixed-window per-user rate limiter backed by an in-memory Map.
 * Designed for the AI chat endpoint but general enough for any use.
 *
 * Defaults: 20 requests per 60-second window.
 * Owner is always exempt — pass `exempt: true` in opts.
 *
 * Usage:
 *   const rl = createRateLimiter({ max: 15, windowMs: 60_000 });
 *   const { allowed, remaining, resetIn } = rl.check(jid);
 */

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * createRateLimiter(opts?) → RateLimiter
 *
 * @param {{ max?: number, windowMs?: number, name?: string }} [opts]
 */
export function createRateLimiter(opts = {}) {
  const max      = opts.max      ?? 20;
  const windowMs = opts.windowMs ?? 60_000;
  const name     = opts.name     ?? 'default';

  /** Map<identifier, { count: number, windowStart: number }> */
  const _store = new Map();

  // Auto-prune every 2 windows to keep memory bounded
  const _pruner = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    let pruned = 0;
    for (const [key, entry] of _store) {
      if (entry.windowStart < cutoff) { _store.delete(key); pruned++; }
    }
    if (pruned) _pruner.unref?.();
  }, windowMs * 2);
  if (_pruner.unref) _pruner.unref();

  return {
    name,
    max,
    windowMs,

    /**
     * check(identifier, exempt?) → { allowed, remaining, resetIn, count }
     *
     * @param {string}  identifier — usually a JID
     * @param {boolean} [exempt]   — if true, always returns allowed:true
     */
    check(identifier, exempt = false) {
      if (exempt) return { allowed: true, remaining: max, resetIn: 0, count: 0 };

      const now = Date.now();
      const entry = _store.get(identifier);

      if (!entry || now - entry.windowStart >= windowMs) {
        // New window
        _store.set(identifier, { count: 1, windowStart: now });
        return { allowed: true, remaining: max - 1, resetIn: windowMs, count: 1 };
      }

      entry.count++;
      const resetIn   = windowMs - (now - entry.windowStart);
      const remaining = Math.max(0, max - entry.count);

      if (entry.count > max) {
        return { allowed: false, remaining: 0, resetIn, count: entry.count };
      }

      return { allowed: true, remaining, resetIn, count: entry.count };
    },

    /**
     * reset(identifier) — manually clear the rate limit for a user.
     */
    reset(identifier) {
      _store.delete(identifier);
    },

    /**
     * status(identifier) → { count, remaining, resetIn } — read-only, no increment.
     */
    status(identifier) {
      const now   = Date.now();
      const entry = _store.get(identifier);
      if (!entry || now - entry.windowStart >= windowMs) {
        return { count: 0, remaining: max, resetIn: 0 };
      }
      return {
        count:     entry.count,
        remaining: Math.max(0, max - entry.count),
        resetIn:   Math.ceil((windowMs - (now - entry.windowStart)) / 1000),
      };
    },
  };
}

// ── Singleton for AI chat ─────────────────────────────────────────────────────

/**
 * aiRateLimiter — 15 requests per 60s per user.
 * Import and use this directly instead of creating your own instance.
 */
export const aiRateLimiter = createRateLimiter({
  name:     'ai_chat',
  max:      15,
  windowMs: 60_000,
});
