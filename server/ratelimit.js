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

// How many trusted proxies sit in front of this app. Unset means none, and
// X-Forwarded-For is ignored entirely: a client could otherwise set it to a fresh
// value on every request and walk straight past the limit.
//
// Behind a reverse proxy this must be set, or every request arrives from the
// proxy's socket address, all clients share one bucket, and a single attacker can
// lock out login for the whole site. Set it to the exact number of hops you
// operate. One Caddy or nginx is 1. Cloudflare plus Caddy is 2.
export const TRUSTED_HOPS = Number(process.env.SRN_TRUST_PROXY || 0) || 0;

// Pure so it can be tested without booting a server.
//
// XFF is a comma-separated chain, appended to by each proxy as the request passes
// through. With N trusted hops the rightmost N entries were written by our own
// proxies, so the client is the entry immediately to their left. Anything further
// left was supplied by the client and is discarded.
export function pickClientAddress(socketAddress, forwardedFor, trustedHops) {
  if (!trustedHops) return socketAddress || 'unknown';
  const chain = String(forwardedFor || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Fewer entries than trusted hops means the request did not come through the
  // proxies we expect, so fall back to the socket rather than trusting XFF.
  if (chain.length < trustedHops) return socketAddress || 'unknown';
  return chain[chain.length - trustedHops] || socketAddress || 'unknown';
}

export function clientKey(req, scope) {
  const ip = pickClientAddress(
    req.socket?.remoteAddress,
    req.headers['x-forwarded-for'],
    TRUSTED_HOPS,
  );
  return `${scope}:${ip}`;
}
