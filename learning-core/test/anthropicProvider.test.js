"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const anthropicProvider = require("../model/anthropicProvider");

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("anthropic provider: invoke() makes NO network call when ANTHROPIC_API_KEY is not set", async () => {
  let called = false;
  const spyFetch = () => {
    called = true;
    throw new Error("should never be called");
  };
  const result = await withEnv("ANTHROPIC_API_KEY", undefined, () => anthropicProvider.invoke({ system: "x", messages: [] }, { fetchImpl: spyFetch }));
  assert.equal(called, false);
  assert.equal(result.status, "NOT_CONFIGURED");
  assert.match(result.reason, /ANTHROPIC_API_KEY/);
});

test("anthropic provider: invoke() calls the verified endpoint shape and extracts text when a credential IS present", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.headers["x-api-key"], "test-key");
    assert.equal(options.headers["anthropic-version"], "2023-06-01");
    return { status: 200, json: async () => ({ content: [{ type: "text", text: "hello from claude" }] }) };
  };
  const result = await withEnv("ANTHROPIC_API_KEY", "test-key", () => anthropicProvider.invoke({ system: "x", messages: [{ role: "user", content: "hi" }] }, { fetchImpl }));
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.output, "hello from claude");
});

test("anthropic provider: a non-200 response is reported as FAILED with the provider's error message, not a crash", async () => {
  const fetchImpl = async () => ({ status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) });
  const result = await withEnv("ANTHROPIC_API_KEY", "bad-key", () => anthropicProvider.invoke({ system: "x", messages: [] }, { fetchImpl }));
  assert.equal(result.status, "FAILED");
  assert.match(result.reason, /invalid x-api-key/);
});

test("anthropic provider: health() reflects credential availability without exposing the value", () => {
  const health = withEnv("ANTHROPIC_API_KEY", "test-key", () => anthropicProvider.health());
  assert.equal(health.connected, true);
});
