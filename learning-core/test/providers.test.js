"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { listProviders, getProvider } = require("../integration/registry/providers");

test("providers: every entry has an explicit, non-guessed status", () => {
  const validStatuses = ["SUPPORTED", "IMPLEMENTED", "CONNECTED", "AUTHORIZED", "NOT_CONNECTED", "NOT_SUPPORTED", "UNKNOWN", "REQUIRES_SPECIAL_ACCESS", "MANUAL"];
  for (const provider of listProviders()) {
    assert.ok(validStatuses.includes(provider.status), `${provider.provider_id} has invalid status ${provider.status}`);
  }
});

test("providers: no provider is marked CONNECTED merely for existing in the registry", () => {
  const wronglyConnected = listProviders().filter((p) => p.status === "CONNECTED");
  assert.equal(wronglyConnected.length, 0);
});

test("providers: unverified claims are labeled as such, not silently treated as confirmed", () => {
  const openai = getProvider("openai");
  assert.equal(openai.verified, false);
});

test("providers: GitHub is IMPLEMENTED (reference connector built this phase), reflecting live-verified endpoints", () => {
  const github = getProvider("github");
  assert.equal(github.status, "IMPLEMENTED");
  assert.equal(github.verified, true);
});

test("providers: a provider found to lack a public API is not upgraded to SUPPORTED", () => {
  const napkin = getProvider("napkin_ai");
  assert.notEqual(napkin.status, "SUPPORTED");
});
