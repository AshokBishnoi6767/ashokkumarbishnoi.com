"use strict";

const { assertProviderShape } = require("./provider");
const anthropicProvider = require("./anthropicProvider");
const credentials = require("../integration/credentials/reference");

// Proves the provider contract without pretending a real model is
// connected. Falls back to this when no real provider has a credential.
const nullProvider = {
  provider_id: "null",
  capabilities() {
    return [];
  },
  invoke() {
    return { status: "UNKNOWN", output: null, reason: "No model provider connected." };
  },
  health() {
    return { connected: false };
  },
};
assertProviderShape(nullProvider);

// Computed once at load, same pattern as connection/store.js's
// credential-derived initial state — matches whatever env is present when
// the process starts.
const DEFAULT_PROVIDERS = Object.freeze({
  anthropic: { status: credentials.isAvailable("anthropic") ? "CONNECTED" : "NOT_CONNECTED", instance: anthropicProvider },
  openai: { status: "NOT_CONNECTED", instance: null },
  gemini: { status: "NOT_CONNECTED", instance: null },
  null: { status: "CONNECTED", instance: nullProvider },
});

function listProviders(providers = DEFAULT_PROVIDERS) {
  return Object.entries(providers).map(([id, p]) => ({ provider_id: id, status: p.status }));
}

// A real connected provider is always preferred over the null fallback.
function pickConnected(providers = DEFAULT_PROVIDERS) {
  const real = Object.entries(providers).find(([id, p]) => id !== "null" && p.status === "CONNECTED");
  if (real) return { provider: real[1].instance, reason: null };
  const found = Object.entries(providers).find(([, p]) => p.status === "CONNECTED");
  if (!found) return { provider: null, reason: "NO_PROVIDER_CONNECTED" };
  return { provider: found[1].instance, reason: null };
}

// A provider throwing (sync) or rejecting (async) must never crash the
// caller — it becomes an observable FAILED result instead.
async function safeInvoke(provider, request) {
  if (!provider) return { status: "UNKNOWN", output: null, reason: "NO_PROVIDER_CONNECTED" };
  try {
    return await Promise.resolve(provider.invoke(request));
  } catch (err) {
    return { status: "FAILED", output: null, reason: "Provider threw: " + err.message };
  }
}

module.exports = { listProviders, pickConnected, safeInvoke, DEFAULT_PROVIDERS, nullProvider };
