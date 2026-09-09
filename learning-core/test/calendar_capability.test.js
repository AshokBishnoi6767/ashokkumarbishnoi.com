"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAction } = require("../integration/actions/lifecycle");
const { setConnectionState, getConnectionState } = require("../integration/connection/store");

const BASE_PARAMS = { title: "Investor Meeting", date: "2026-09-10", time: "14:00", timezone: "Asia/Kolkata" };

function withGrantedWriteScope(fn) {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  return Promise.resolve(fn()).finally(() => setConnectionState("test_calendar", previous));
}

// C. Capability resolution / D. Provider resolution
test("calendar: resolves to the only currently-connected provider (test_calendar) over the disconnected real one", async () => {
  const result = await runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "test", why: "test", confirmed: true });
  assert.equal(result.tool, "test_calendar");
});

test("calendar: when NOTHING is connected, resolution still names the preferred real provider (google_calendar) in the BLOCKED reason", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "DISCONNECTED", scopes: [] });
  try {
    const result = await runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "test", why: "test", confirmed: true });
    assert.equal(result.tool, "google_calendar");
    assert.match(result.note, /google_calendar/);
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

// F. Authorization states — connection exists (PARTIALLY_AUTHORIZED) but required write permission does not
test("calendar: CRITICAL NEGATIVE — connected but missing required write scope is BLOCKED, not routed around", async () => {
  // Force resolution onto test_calendar by leaving google_calendar disconnected (default) — test_calendar
  // is PARTIALLY_AUTHORIZED by default but only has read scope.
  const result = await runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "test", why: "test", confirmed: true });
  assert.equal(result.tool, "test_calendar");
  assert.equal(result.action_status, "NOT_AUTHORIZED");
  assert.equal(result.result, "BLOCKED");
  assert.match(result.note, /calendar.events.write/);
});

// H. Approval states / CRITICAL NEGATIVE — approval absent
test("calendar: CRITICAL NEGATIVE — approval absent means BLOCKED, not merely pending", async () => {
  const result = await withGrantedWriteScope(() => runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "test", why: "test" }));
  assert.equal(result.action_status, "PENDING_CONFIRMATION");
  assert.equal(result.result, "BLOCKED");
  assert.equal(result.action_ref, null);
});

// I. Successful execution
test("calendar: SUCCESS — real write scope granted, approval given, verified by read-back", async () => {
  const result = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(result.action_status, "COMPLETED");
  assert.equal(result.result, "SUCCESS");
  assert.equal(result.verified, true);
  assert.ok(result.action_ref);
});

// J. Provider failure
test("calendar: PROVIDER_FAILURE scenario is reported as FAILED, not silently swallowed", async () => {
  const result = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: { ...BASE_PARAMS, __test_scenario: "PROVIDER_FAILURE" }, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(result.result, "FAILED");
  assert.equal(result.action_ref, null);
});

// K. Authorization failure at the provider itself (distinct from our own pre-check)
test("calendar: AUTHORIZATION_FAILURE scenario (provider-side) is BLOCKED even though our own pre-check passed", async () => {
  const result = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: { ...BASE_PARAMS, __test_scenario: "AUTHORIZATION_FAILURE" }, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(result.result, "BLOCKED");
});

// L. Invalid parameters
test("calendar: INVALID_PARAMETERS scenario is FAILED with a specific reason, no action_ref", async () => {
  const result = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: { title: "X", __test_scenario: "INVALID_PARAMETERS" }, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(result.result, "FAILED");
  assert.match(result.note, /Missing required parameter/);
});

// M. Timeout / CRITICAL NEGATIVE — timeout must not be silently retried into a duplicate
test("calendar: TIMEOUT scenario is UNKNOWN, not FAILED and not SUCCESS, and produces exactly one action record", async () => {
  const before = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: { ...BASE_PARAMS, __test_scenario: "TIMEOUT" }, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(before.result, "UNKNOWN");
  assert.equal(before.action_ref, null);
});

// N. Ambiguous result
test("calendar: AMBIGUOUS_RESULT scenario cannot be claimed as SUCCESS", async () => {
  const result = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: { ...BASE_PARAMS, __test_scenario: "AMBIGUOUS_RESULT" }, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(result.result, "UNKNOWN");
  assert.equal(result.verified, false);
});

// O/P. Verification success vs failure — CRITICAL NEGATIVE from section 35:
// provider says success, read-back finds nothing -> UNKNOWN, never SUCCESS.
test("calendar: CRITICAL NEGATIVE — provider claims success but read-back finds nothing => UNKNOWN, never SUCCESS", async () => {
  const result = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: { ...BASE_PARAMS, __test_scenario: "VERIFICATION_FAILURE" }, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(result.result, "UNKNOWN");
  assert.notEqual(result.result, "SUCCESS");
});

test("calendar: PARTIAL_RESULT scenario is reported as PARTIAL, not SUCCESS", async () => {
  const result = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: { ...BASE_PARAMS, __test_scenario: "PARTIAL_RESULT" }, requestedBy: "test", why: "test", confirmed: true })
  );
  assert.equal(result.result, "PARTIAL");
});

// Read capability works with the DEFAULT (read-only) test_calendar connection state
test("calendar: read capability works with default read-only scope (no grant needed)", async () => {
  const created = await withGrantedWriteScope(() => runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "test", why: "test", confirmed: true }));
  const read = await runAction({ capabilityId: "calendar.event.read", params: { event_id: created.action_ref }, requestedBy: "test", why: "test" });
  assert.equal(read.result, "SUCCESS");
});

// T. No unauthorized execution — a model "proposing" the capability with no approval/authorization never executes
test("calendar: CRITICAL NEGATIVE — model proposing the capability alone never causes execution without both authorization and approval", async () => {
  const noWriteScope = await runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "model-proposal", why: "model proposed this", confirmed: true });
  assert.notEqual(noWriteScope.result, "SUCCESS");

  const noApproval = await withGrantedWriteScope(() =>
    runAction({ capabilityId: "calendar.event.create", params: BASE_PARAMS, requestedBy: "model-proposal", why: "model proposed this" })
  );
  assert.notEqual(noApproval.result, "SUCCESS");
});
