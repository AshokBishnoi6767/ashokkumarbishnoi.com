"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAction } = require("../integration/actions/lifecycle");
const { getCapability } = require("../integration/registry/capabilities");

test("tools: capability lookup succeeds for a registered capability", () => {
  assert.ok(getCapability("mock.ping"));
});

test("tools: unsupported/unregistered capability is rejected, never hallucinated", async () => {
  const result = await runAction({ capabilityId: "definitely.not.real", requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "CAPABILITY_NOT_AVAILABLE");
  assert.equal(result.result, "BLOCKED");
});

test("tools: a capability with UNKNOWN registry status can never execute", async () => {
  const result = await runAction({ capabilityId: "calendly.get_availability", requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "CAPABILITY_NOT_AVAILABLE");
  assert.match(result.note, /UNKNOWN/);
});

test("tools: authorization state blocks a real-but-disconnected tool", async () => {
  const result = await runAction({ capabilityId: "github.get_repository", params: { owner: "octocat", repo: "hello-world" }, requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "NOT_AUTHORIZED");
  assert.equal(result.authorization_state_at_time, "DISCONNECTED");
  assert.equal(result.action_ref, null);
});

test("actions: a read-only capability executes and is verified", async () => {
  const result = await runAction({ capabilityId: "mock.ping", params: { x: 1 }, requestedBy: "test", why: "unit test" });
  assert.equal(result.result, "SUCCESS");
  assert.equal(result.verified, true);
});

test("actions: a confirmation-required capability does NOT execute without confirmation (proposal != authorization)", async () => {
  const result = await runAction({ capabilityId: "mock.create_record", params: { name: "x" }, requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "PENDING_CONFIRMATION");
  assert.equal(result.result, "BLOCKED");
  assert.equal(result.action_ref, null);
});

test("actions: a HIGH-risk capability requires confirmation even when requires_confirmation is false on the registry entry", async () => {
  const result = await runAction({ capabilityId: "mock.high_risk_op", requestedBy: "test", why: "unit test" });
  assert.equal(result.action_status, "PENDING_CONFIRMATION");
  assert.equal(result.action_ref, null);
});

test("actions: the same HIGH-risk capability executes once explicitly confirmed", async () => {
  const result = await runAction({ capabilityId: "mock.high_risk_op", requestedBy: "test", why: "unit test", confirmed: true });
  assert.equal(result.action_status, "COMPLETED");
  assert.equal(result.result, "SUCCESS");
});

test("actions: the same capability executes and verifies once explicitly confirmed", async () => {
  const result = await runAction({ capabilityId: "mock.create_record", params: { name: "y" }, requestedBy: "test", why: "unit test", confirmed: true });
  assert.equal(result.action_status, "COMPLETED");
  assert.equal(result.result, "SUCCESS");
  assert.equal(result.verified, true);
  assert.ok(result.action_ref);
});
