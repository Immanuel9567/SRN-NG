// Fixed-window rate limiter for the auth endpoints.
// In-memory on purpose: this server is single-process, and the datastore is the repo.

const buckets = new Map();
const SWEEP_INTERVAL_MS = 60_000;

let sweeper = null;
function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (now > entry.resetAt) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  // Do not hold the event loop open just for cleanup.
  sweeper.unref?.();
}

export function rateLimit(key, { limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  ensureSweeper();
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  entry.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  if (entry.count > limit) return { allowed: false, remaining: 0, retryAfterSec };
  return { allowed: true, remaining: limit - entry.count, retryAfterSec };
}

export function resetRateLimits() {
  buckets.clear();
}

// Uses the socket address only. X-Forwarded-For is deliberately ignored: a client
// could set it to a fresh value on every request and walk straight past the limit.
// If this is ever put behind a trusted proxy, derive the IP there instead.
export function clientKey(req, scope) {
  const ip = req.socket?.remoteAddress || 'unknown';
  return `${scope}:${ip}`;
}
