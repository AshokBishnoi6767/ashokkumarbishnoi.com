"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAction } = require("../integration/actions/lifecycle");
const { getCapability } = require("../integration/registry/capabilities");

test("tools: capability lookup succeeds for a registered capability", () => {
  assert.ok(getCapability("mock.ping"));
});

test("tools: unsupported/unregistered capability is rejected, never hallucinated", () => {
  const result = runAction({ capabilityId: "definitely.not.real", requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "CAPABILITY_NOT_AVAILABLE");
  assert.equal(result.result, "BLOCKED");
});

test("tools: authorization state blocks a real-but-disconnected tool", () => {
  const result = runAction({ capabilityId: "calendly.get_availability", requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "NOT_AUTHORIZED");
  assert.equal(result.authorization_state_at_time, "DISCONNECTED");
  assert.equal(result.action_ref, null);
});

test("actions: a read-only capability executes and is verified", () => {
  const result = runAction({ capabilityId: "mock.ping", params: { x: 1 }, requestedBy: "test", why: "unit test" });
  assert.equal(result.result, "SUCCESS");
  assert.equal(result.verified, true);
});

test("actions: a confirmation-required capability does NOT execute without confirmation (proposal != authorization)", () => {
  const result = runAction({ capabilityId: "mock.create_record", params: { name: "x" }, requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "PENDING_CONFIRMATION");
  assert.equal(result.result, "EXPECTED");
  assert.equal(result.action_ref, null);
});

test("actions: the same capability executes and verifies once explicitly confirmed", () => {
  const result = runAction({ capabilityId: "mock.create_record", params: { name: "y" }, requestedBy: "test", why: "unit test", confirmed: true });
  assert.equal(result.action_status, "COMPLETED");
  assert.equal(result.result, "SUCCESS");
  assert.equal(result.verified, true);
  assert.ok(result.action_ref);
});
