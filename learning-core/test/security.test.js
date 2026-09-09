"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAction } = require("../integration/actions/lifecycle");
const credentials = require("../integration/credentials/reference");
const logger = require("../shared/logger");

test("security: an unauthorized (disconnected) tool's capability is rejected before execution", async () => {
  const result = await runAction({ capabilityId: "github.get_repository", params: { owner: "octocat", repo: "hello-world" }, requestedBy: "attacker-or-user", why: "test" });
  assert.equal(result.action_status, "NOT_AUTHORIZED");
  assert.equal(result.action_ref, null);
  assert.equal(result.verified, false);
});

test("security: an arbitrary/invented capability is rejected, never treated as real", async () => {
  const result = await runAction({ capabilityId: "hubspot.delete_all_contacts", requestedBy: "test", why: "test" });
  assert.equal(result.action_status, "CAPABILITY_NOT_AVAILABLE");
});

test("security: credential describe() never contains the raw secret value", () => {
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "ghp_supersecrettestvalue";
  try {
    const description = credentials.describe("github");
    const serialized = JSON.stringify(description);
    assert.ok(!serialized.includes("ghp_supersecrettestvalue"));
    assert.equal(description.credential_available, true);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previous;
  }
});

test("security: logger redacts fields that look like secrets", () => {
  const entry = logger.info("test_event", {
    api_key: "sk-live-abc123",
    token: "eyJhbGciOi",
    nested: { password: "hunter2" },
    safe_field: "this is fine",
  });
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes("sk-live-abc123"));
  assert.ok(!serialized.includes("eyJhbGciOi"));
  assert.ok(!serialized.includes("hunter2"));
  assert.ok(serialized.includes("this is fine"));
  assert.equal(entry.api_key, "[REDACTED]");
  assert.equal(entry.nested.password, "[REDACTED]");
});
