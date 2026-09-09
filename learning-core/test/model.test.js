"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { listProviders, pickConnected, safeInvoke, DEFAULT_PROVIDERS, nullProvider } = require("../model/registry");
const { assertProviderShape } = require("../model/provider");

test("model: lists providers with explicit connection status", () => {
  const providers = listProviders();
  const openai = providers.find((p) => p.provider_id === "openai");
  assert.equal(openai.status, "NOT_CONNECTED");
});

test("model: provider abstraction enforces required methods", () => {
  assert.throws(() => assertProviderShape({}), Error);
  assert.doesNotThrow(() => assertProviderShape(nullProvider));
});

test("model: missing provider is reported explicitly, never silently substituted", () => {
  const allDisconnected = {
    openai: { status: "NOT_CONNECTED", instance: null },
    claude: { status: "NOT_CONNECTED", instance: null },
  };
  const { provider, reason } = pickConnected(allDisconnected);
  assert.equal(provider, null);
  assert.equal(reason, "NO_PROVIDER_CONNECTED");
});

test("model: provider failure becomes an observable FAILED result, not a crash", () => {
  const throwingProvider = { invoke: () => { throw new Error("upstream timeout"); } };
  const result = safeInvoke(throwingProvider, { prompt: "hi" });
  assert.equal(result.status, "FAILED");
  assert.match(result.reason, /upstream timeout/);
});

test("model: default registry has exactly one connected provider (the null provider)", () => {
  const connectedCount = Object.values(DEFAULT_PROVIDERS).filter((p) => p.status === "CONNECTED").length;
  assert.equal(connectedCount, 1);
});
