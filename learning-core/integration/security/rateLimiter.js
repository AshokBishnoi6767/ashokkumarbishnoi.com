"use strict";

// Minimal in-memory sliding-window rate limiter. Per-process, per-key —
// the same tradeoff as connection/store.js's in-memory state: resets on
// restart, and does not coordinate across multiple instances. An honest
// first control against brute-force/credential-stuffing and basic
// resource exhaustion on a single-instance deployment, not a claim of
// distributed rate limiting.
const WINDOWS = new Map(); // key -> array of request timestamps (ms), pruned lazily

function checkLimit(key, { max, windowMs }) {
  const now = Date.now();
  const previous = WINDOWS.get(key) || [];
  const timestamps = previous.filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    WINDOWS.set(key, timestamps);
    return { allowed: false, retryAfterMs: windowMs - (now - timestamps[0]) };
  }

  timestamps.push(now);
  WINDOWS.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

function _reset() {
  WINDOWS.clear();
}

module.exports = { checkLimit, _reset };
