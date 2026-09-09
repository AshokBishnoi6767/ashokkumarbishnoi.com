"use strict";

// Real model provider. Endpoint/headers/body/response shape verified live
// against platform.claude.com this session:
//   POST https://api.anthropic.com/v1/messages
//   Headers: x-api-key (legacy but explicitly still supported, used here
//     since ANTHROPIC_API_KEY is a plain API key, not an OAuth token),
//     anthropic-version: 2023-06-01, content-type: application/json
//   Body: { model, max_tokens, system, messages: [{role, content}] }
//   Response: content[0].text holds the reply text.
//
// STOPS AT THE CREDENTIAL BOUNDARY: if ANTHROPIC_API_KEY is not set,
// invoke() never makes a network call — it returns a structured
// NOT_CONFIGURED result explaining exactly what's missing.
const { assertProviderShape } = require("./provider");
const credentials = require("../integration/credentials/reference");

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;

function invoke({ system, messages }, { fetchImpl = fetch } = {}) {
  if (!credentials.isAvailable("anthropic")) {
    return Promise.resolve({
      status: "NOT_CONFIGURED",
      output: null,
      reason: "ANTHROPIC_API_KEY is not set — no request was sent. Set this environment variable to a real Anthropic API key to enable real responses.",
    });
  }
  const apiKey = credentials.getForConnectorUse("anthropic");

  return fetchImpl(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
  })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (res.status !== 200) {
        return { status: "FAILED", output: null, reason: body && body.error ? body.error.message : `Provider returned HTTP ${res.status}.` };
      }
      const text = body && body.content && body.content[0] && body.content[0].text;
      if (!text) {
        return { status: "UNKNOWN", output: null, reason: "Provider responded but no text content was found in the expected shape." };
      }
      return { status: "SUCCESS", output: text, usage: body.usage || null };
    })
    .catch((err) => ({ status: "UNKNOWN", output: null, reason: "Network error: " + err.message }));
}

const anthropicProvider = {
  provider_id: "anthropic",
  capabilities() {
    return ["chat"];
  },
  invoke,
  health() {
    return { connected: credentials.isAvailable("anthropic") };
  },
};

assertProviderShape(anthropicProvider);

module.exports = anthropicProvider;
