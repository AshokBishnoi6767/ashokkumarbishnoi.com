"use strict";

const { assertProviderShape } = require("./provider");

// Proves the provider contract without pretending a real model is
// connected. Every real provider (OpenAI/Claude/Gemini) is NOT_CONNECTED —
// no production credentials exist in this phase.
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

const DEFAULT_PROVIDERS = Object.freeze({
  null: { status: "CONNECTED", instance: nullProvider },
  openai: { status: "NOT_CONNECTED", instance: null },
  claude: { status: "NOT_CONNECTED", instance: null },
  gemini: { status: "NOT_CONNECTED", instance: null },
});

function listProviders(providers = DEFAULT_PROVIDERS) {
  return Object.entries(providers).map(([id, p]) => ({ provider_id: id, status: p.status }));
}

function pickConnected(providers = DEFAULT_PROVIDERS) {
  const found = Object.entries(providers).find(([, p]) => p.status === "CONNECTED");
  if (!found) return { provider: null, reason: "NO_PROVIDER_CONNECTED" };
  return { provider: found[1].instance, reason: null };
}

// A provider throwing must never crash the caller — it becomes an
// observable FAILED result instead.
function safeInvoke(provider, request) {
  if (!provider) return { status: "UNKNOWN", output: null, reason: "NO_PROVIDER_CONNECTED" };
  try {
    return provider.invoke(request);
  } catch (err) {
    return { status: "FAILED", output: null, reason: "Provider threw: " + err.message };
  }
}

module.exports = { listProviders, pickConnected, safeInvoke, DEFAULT_PROVIDERS, nullProvider };
