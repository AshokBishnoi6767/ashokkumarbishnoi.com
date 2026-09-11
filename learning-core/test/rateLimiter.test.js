"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { checkLimit, _reset } = require("../integration/security/rateLimiter");

beforeEach(() => {
  _reset();
});

test("checkLimit: allows requests up to the max within the window", () => {
  for (let i = 0; i < 3; i++) {
    const result = checkLimit("key-a", { max: 3, windowMs: 1000 });
    assert.equal(result.allowed, true);
  }
});

test("checkLimit: the (max+1)th request within the window is refused", () => {
  for (let i = 0; i < 3; i++) checkLimit("key-b", { max: 3, windowMs: 1000 });
  const result = checkLimit("key-b", { max: 3, windowMs: 1000 });
  assert.equal(result.allowed, false);
  assert.ok(result.retryAfterMs > 0);
});

test("checkLimit: different keys have independent windows", () => {
  for (let i = 0; i < 3; i++) checkLimit("key-c", { max: 3, windowMs: 1000 });
  const result = checkLimit("key-d", { max: 3, windowMs: 1000 });
  assert.equal(result.allowed, true);
});

test("checkLimit: a request outside the window is allowed again (sliding window, not a hard reset)", async () => {
  for (let i = 0; i < 2; i++) checkLimit("key-e", { max: 2, windowMs: 50 });
  assert.equal(checkLimit("key-e", { max: 2, windowMs: 50 }).allowed, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(checkLimit("key-e", { max: 2, windowMs: 50 }).allowed, true);
});
