"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { checkClaimSafety, checkActionSafety } = require("../integration/safety/constraintGate");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { assignProbability } = require("../language/realm/probabilityRealm");
const math = require("../math/engine");
const { runAction } = require("../integration/actions/lifecycle");

function recordFor(text) {
  const { tokens } = tokenize(text);
  return extractKnowledge(text, tokens).records[0];
}

test("Constraint gate: a real, unmodified KnowledgeRecord is safe", () => {
  const record = recordFor("Dog bites man.");
  const result = checkClaimSafety(record);
  assert.equal(result.safe, true);
  assert.deepEqual(result.violations, []);
});

test("Constraint gate: a claim missing evidence/provenance is flagged unsafe", () => {
  const result = checkClaimSafety({ id: "claim-1" });
  assert.equal(result.safe, false);
  assert.ok(result.violations.some((v) => v.includes("evidence")));
  assert.ok(result.violations.some((v) => v.includes("provenance")));
});

test("Constraint gate: a claim with a fabricated probability (no PROBABILITY_UNCERTAINTY provenance) is flagged unsafe", () => {
  const record = recordFor("Dog bites man.");
  const fabricated = { ...record, probability: 0.72 };
  const result = checkClaimSafety(fabricated);
  assert.equal(result.safe, false);
  assert.ok(result.violations.some((v) => v.includes("fabrication")));
});

test("Constraint gate: a probability assigned through assignProbability() (real provenance) is NOT flagged as fabricated", () => {
  const record = recordFor("Dog bites man.");
  const bayes = math.bayesRule({ pBGivenA: 0.9, pA: 0.2, pB: 0.3 });
  const withProbability = assignProbability(record, bayes);
  const result = checkClaimSafety(withProbability);
  assert.equal(result.safe, true);
});

test("Constraint gate: an invalid/invented truth_state value is flagged unsafe", () => {
  const record = recordFor("Dog bites man.");
  const tampered = { ...record, truth_state: "DEFINITELY_TRUE" };
  const result = checkClaimSafety(tampered);
  assert.equal(result.safe, false);
  assert.ok(result.violations.some((v) => v.includes("truth_state")));
});

test("Constraint gate: rejects a non-object claim without throwing", () => {
  assert.equal(checkClaimSafety(null).safe, false);
  assert.equal(checkClaimSafety(undefined).safe, false);
  assert.equal(checkClaimSafety("a string").safe, false);
});

test("Constraint gate: a real, honestly-produced action record (mock.ping) is safe", async () => {
  const actionRecord = await runAction({ capabilityId: "mock.ping", params: {}, requestedBy: "test", why: "unit test" });
  const result = checkActionSafety(actionRecord);
  assert.equal(result.safe, true);
});

test("Constraint gate: an action record missing required fields is flagged unsafe", () => {
  const result = checkActionSafety({ action_id: "action-1" });
  assert.equal(result.safe, false);
  assert.ok(result.violations.some((v) => v.includes("capability")));
});

test("Constraint gate: a tampered action record claiming verified:true with no action_ref is flagged unsafe", () => {
  const tampered = { action_id: "action-1", capability: "mock.ping", action_status: "COMPLETED", result: "SUCCESS", verified: true, action_ref: null };
  const result = checkActionSafety(tampered);
  assert.equal(result.safe, false);
  assert.ok(result.violations.some((v) => v.includes("action_ref")));
});

test("Constraint gate: an action record with an invented action_status is flagged unsafe", () => {
  const tampered = { action_id: "action-1", capability: "mock.ping", action_status: "DEFINITELY_DONE", result: "SUCCESS" };
  const result = checkActionSafety(tampered);
  assert.equal(result.safe, false);
  assert.ok(result.violations.some((v) => v.includes("action_status")));
});

test("Constraint gate: does not execute, authorize, or block anything itself — purely reads the record given", async () => {
  const blocked = await runAction({ capabilityId: "definitely.not.real", requestedBy: "test", why: "unit test" });
  const result = checkActionSafety(blocked);
  // A legitimately BLOCKED record is itself well-formed and honest — not "unsafe".
  assert.equal(result.safe, true);
});
