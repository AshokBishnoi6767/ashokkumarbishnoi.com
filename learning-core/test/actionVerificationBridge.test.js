"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { runAction } = require("../integration/actions/lifecycle");
const { actionRecordToVerificationOutcome, recordActionAsFeedback } = require("../integration/actions/verificationBridge");
const { VerificationOutcome, ResultStatus } = require("../shared/constants");

test("Action bridge: a real, independently-verified SUCCESS action maps to VerificationOutcome.VERIFIED", async () => {
  const actionRecord = await runAction({ capabilityId: "mock.ping", params: { x: 1 }, requestedBy: "test", why: "unit test" });
  assert.equal(actionRecord.result, ResultStatus.SUCCESS);
  assert.equal(actionRecord.verified, true);

  const verification = actionRecordToVerificationOutcome(actionRecord);
  assert.equal(verification.outcome, VerificationOutcome.VERIFIED);
  assert.equal(verification.action_id, actionRecord.action_id);
});

test("Action bridge: a real BLOCKED action (unregistered capability) maps to NOT_VERIFIABLE", async () => {
  const actionRecord = await runAction({ capabilityId: "definitely.not.real", requestedBy: "test", why: "unit test" });
  assert.equal(actionRecord.result, ResultStatus.BLOCKED);

  const verification = actionRecordToVerificationOutcome(actionRecord);
  assert.equal(verification.outcome, VerificationOutcome.NOT_VERIFIABLE);
});

test("Action bridge: a real NOT_AUTHORIZED action (disconnected tool) also maps to NOT_VERIFIABLE via BLOCKED", async () => {
  const actionRecord = await runAction({ capabilityId: "github.get_repository", params: { owner: "octocat", repo: "hello-world" }, requestedBy: "test", why: "unit test" });
  assert.equal(actionRecord.result, ResultStatus.BLOCKED);
  assert.equal(actionRecordToVerificationOutcome(actionRecord).outcome, VerificationOutcome.NOT_VERIFIABLE);
});

test("Action bridge: SUCCESS without independent verification maps to UNKNOWN, never VERIFIED just because the result says SUCCESS", () => {
  const claimedOnly = { action_id: "action-x", result: ResultStatus.SUCCESS, verified: false };
  assert.equal(actionRecordToVerificationOutcome(claimedOnly).outcome, VerificationOutcome.UNKNOWN);
});

test("Action bridge: FAILED maps to CONTRADICTED — real contrary evidence, not mere absence of info", () => {
  const failed = { action_id: "action-y", result: ResultStatus.FAILED, verified: false };
  assert.equal(actionRecordToVerificationOutcome(failed).outcome, VerificationOutcome.CONTRADICTED);
});

test("Action bridge: PARTIAL maps to PARTIALLY_VERIFIED", () => {
  const partial = { action_id: "action-z", result: ResultStatus.PARTIAL, verified: false };
  assert.equal(actionRecordToVerificationOutcome(partial).outcome, VerificationOutcome.PARTIALLY_VERIFIED);
});

test("Action bridge: RECOVERING and EXPECTED both map to UNKNOWN, not a terminal verdict", () => {
  assert.equal(actionRecordToVerificationOutcome({ action_id: "a", result: ResultStatus.RECOVERING }).outcome, VerificationOutcome.UNKNOWN);
  assert.equal(actionRecordToVerificationOutcome({ action_id: "a", result: ResultStatus.EXPECTED }).outcome, VerificationOutcome.UNKNOWN);
});

test("Action bridge: rejects a record with no result field", () => {
  assert.throws(() => actionRecordToVerificationOutcome({}), TypeError);
  assert.throws(() => actionRecordToVerificationOutcome(null), TypeError);
});

test("Action bridge: recordActionAsFeedback feeds a real action record into the Feedback Engine as CONFIRMED on true success", async () => {
  const actionRecord = await runAction({ capabilityId: "mock.ping", params: {}, requestedBy: "test", why: "unit test" });
  const cycle = recordActionAsFeedback(actionRecord);
  assert.equal(cycle.feedback, "CONFIRMED");
  assert.equal(cycle.updated_state.confirmed_count, 1);
  assert.deepEqual(cycle.evidence, actionRecord);
});

test("Action bridge: recordActionAsFeedback feeds a real BLOCKED action record as MISMATCH (estimate was SUCCESS, it was blocked)", async () => {
  const actionRecord = await runAction({ capabilityId: "definitely.not.real", requestedBy: "test", why: "unit test" });
  const cycle = recordActionAsFeedback(actionRecord);
  assert.equal(cycle.feedback, "MISMATCH");
  assert.equal(cycle.updated_state.mismatch_count, 1);
});

test("Action bridge: does not execute anything itself — calling it never touches capabilities/connectors", () => {
  // A pure record shape with no capability that exists in the registry at all.
  const fabricated = { action_id: "action-fake", capability: "totally.made.up", result: ResultStatus.SUCCESS, verified: true };
  const verification = actionRecordToVerificationOutcome(fabricated);
  assert.equal(verification.outcome, VerificationOutcome.VERIFIED); // trusts the record's own verified flag; never re-executes to check
  assert.equal(verification.provenance.realm, "TOOL_ACTION_INTEGRATION");
});
