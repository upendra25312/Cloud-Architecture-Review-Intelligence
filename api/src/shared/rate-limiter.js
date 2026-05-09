// In-memory token-bucket rate limiter. Per-instance on Consumption plan —
// acceptable for pilot scale where a single instance handles all traffic.
// Upgrade to Table Storage-backed counter when multi-instance scale is needed.

const { jsonResponse } = require("./auth");

const buckets = new Map(); // key → { tokens, lastRefillMs }

// Prune stale entries hourly to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  for (const [key, b] of buckets) {
    if (b.lastRefillMs < cutoff) buckets.delete(key);
  }
}, 300_000).unref();

function checkLimit(key, { maxTokens, refillIntervalMs }) {
  const now = Date.now();
  let b = buckets.get(key);

  if (!b) {
    buckets.set(key, { tokens: maxTokens - 1, lastRefillMs: now });
    return { allowed: true, remaining: maxTokens - 1 };
  }

  const refills = Math.floor((now - b.lastRefillMs) / refillIntervalMs);
  if (refills > 0) {
    b.tokens = Math.min(maxTokens, b.tokens + refills);
    b.lastRefillMs = now + ((now - b.lastRefillMs) % refillIntervalMs) - refillIntervalMs;
  }

  if (b.tokens <= 0) {
    const retryAfterSec = Math.ceil((b.lastRefillMs + refillIntervalMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  b.tokens -= 1;
  return { allowed: true, remaining: b.tokens };
}

// Returns a 429 response or null. Attach to any handler before business logic.
function rateLimitResponse(request, principal, { maxTokens, refillIntervalMs, label }) {
  // Keyed by userId so authenticated users each get their own bucket.
  // Falls back to IP header for unauthenticated callers.
  const userId = principal?.userId
    ?? request.headers.get("x-forwarded-for")
    ?? "anonymous";
  const key = `${label}:${userId}`;

  const result = checkLimit(key, { maxTokens, refillIntervalMs });
  if (result.allowed) return null;

  return {
    ...jsonResponse(429, {
      error: `Rate limit exceeded. Retry after ${result.retryAfterSec}s.`,
      retryAfterSec: result.retryAfterSec
    }),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(result.retryAfterSec),
      "X-RateLimit-Limit": String(maxTokens),
      "X-RateLimit-Remaining": "0"
    }
  };
}

// Pre-configured limiters for the two expensive endpoints
const EXTRACTION_LIMIT = { maxTokens: 5, refillIntervalMs: 600_000, label: "extract" }; // 5 per 10 min
const COPILOT_LIMIT    = { maxTokens: 10, refillIntervalMs: 60_000,  label: "copilot" }; // 10 per min
const UPLOAD_LIMIT     = { maxTokens: 20, refillIntervalMs: 600_000, label: "upload"  }; // 20 per 10 min

module.exports = { rateLimitResponse, EXTRACTION_LIMIT, COPILOT_LIMIT, UPLOAD_LIMIT };
