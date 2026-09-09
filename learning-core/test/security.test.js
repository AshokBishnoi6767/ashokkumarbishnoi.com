"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAction } = require("../integration/actions/lifecycle");
const logger = require("../shared/logger");

test("security: an unauthorized (disconnected) tool's capability is rejected before execution", () => {
  const result = runAction({ capabilityId: "calendly.get_availability", requestedBy: "attacker-or-user", why: "test" });
  assert.equal(result.action_status, "NOT_AUTHORIZED");
  assert.equal(result.action_ref, null);
  assert.equal(result.verified, false);
});

test("security: an arbitrary/invented capability is rejected, never treated as real", () => {
  const result = runAction({ capabilityId: "hubspot.delete_all_contacts", requestedBy: "test", why: "test" });
  assert.equal(result.action_status, "CAPABILITY_NOT_AVAILABLE");
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
