"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  CandidateStatus,
  proposeCandidate,
  validateCandidate,
  regressionTest,
  acceptCandidate,
  promoteCandidate,
} = require("../learning/candidatePipeline");
const memoryStore = require("../memory/store");

beforeEach(() => memoryStore._reset());

const goodRule = { id: "rule-1", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };

test("Learning pipeline: proposeCandidate starts SANDBOXED", () => {
  const c = proposeCandidate({ kind: "REASONING_RULE", payload: goodRule });
  assert.equal(c.status, CandidateStatus.SANDBOXED);
  assert.equal(c.history.length, 1);
});

test("Learning pipeline: validateCandidate accepts a well-formed rule", () => {
  const c = validateCandidate(proposeCandidate({ kind: "REASONING_RULE", payload: goodRule }));
  assert.equal(c.status, CandidateStatus.VALIDATED);
});

test("Learning pipeline: validateCandidate rejects a malformed rule, never silently accepting it", () => {
  const c = validateCandidate(proposeCandidate({ kind: "REASONING_RULE", payload: { id: "bad" } }));
  assert.equal(c.status, CandidateStatus.REJECTED);
  assert.match(c.rejection_reason, /rule shape/);
});

test("Learning pipeline: validateCandidate rejects an unknown kind rather than defaulting to accept", () => {
  const c = validateCandidate(proposeCandidate({ kind: "MYSTERY", payload: {} }));
  assert.equal(c.status, CandidateStatus.REJECTED);
});

test("Learning pipeline: regressionTest passes a rule that introduces no new contradiction", () => {
  const penguin = { id: "entity-penguin", surface: "Penguins" };
  const baseline = [{ id: "know-1", subject: penguin, predicate: "IS_A", object: { surface: "bird" } }];
  let c = validateCandidate(proposeCandidate({ kind: "REASONING_RULE", payload: goodRule }));
  c = regressionTest(c, baseline);
  assert.equal(c.status, CandidateStatus.REGRESSION_PASSED);
});

test("Learning pipeline: regressionTest rejects a rule that introduces a new contradiction against the baseline", () => {
  const john = { id: "entity-john", surface: "John" };
  const toronto = { id: "entity-toronto", surface: "Toronto" };
  // Baseline already asserts John LOCATED_IN Toronto (positive).
  const baseline = [{ id: "know-a", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE" }];
  // Candidate rule: anyone who IS_A "traveler" is asserted LOCATED_IN "Toronto" with NEGATIVE polarity would need a FACT kind;
  // instead demonstrate via a FACT candidate that directly conflicts.
  const conflictingFact = { subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE" };
  let c = validateCandidate(proposeCandidate({ kind: "FACT", payload: conflictingFact }));
  c = regressionTest(c, baseline);
  assert.equal(c.status, CandidateStatus.REJECTED);
  assert.match(c.rejection_reason, /Regression failed/);
});

test("Learning pipeline: cannot skip stages — regressionTest requires VALIDATED, not SANDBOXED", () => {
  const c = proposeCandidate({ kind: "REASONING_RULE", payload: goodRule });
  assert.throws(() => regressionTest(c, []), TypeError);
});

test("Learning pipeline: cannot skip stages — acceptCandidate requires REGRESSION_PASSED", () => {
  const c = validateCandidate(proposeCandidate({ kind: "REASONING_RULE", payload: goodRule }));
  assert.throws(() => acceptCandidate(c, { approvedBy: "ashok" }), TypeError);
});

test("Learning pipeline: acceptCandidate requires an explicit approvedBy — nothing auto-approves", () => {
  let c = validateCandidate(proposeCandidate({ kind: "REASONING_RULE", payload: goodRule }));
  c = regressionTest(c, []);
  assert.throws(() => acceptCandidate(c, {}), TypeError);
  assert.throws(() => acceptCandidate(c), TypeError);
});

test("Learning pipeline: cannot skip stages — promoteCandidate requires ACCEPTED", () => {
  let c = validateCandidate(proposeCandidate({ kind: "REASONING_RULE", payload: goodRule }));
  c = regressionTest(c, []);
  assert.throws(() => promoteCandidate(c), TypeError);
});

test("Learning pipeline: full happy path — a bare conversation input cannot reach PROMOTED without every gate", () => {
  let c = proposeCandidate({ kind: "REASONING_RULE", payload: goodRule, evidence: ["repeated user correction x3"] });
  c = validateCandidate(c);
  c = regressionTest(c, []);
  c = acceptCandidate(c, { approvedBy: "ashok" });
  const { candidate, memoryRecord } = promoteCandidate(c);
  assert.equal(candidate.status, CandidateStatus.PROMOTED);
  assert.equal(memoryRecord.type, "learned_reasoning_rule");
  assert.deepEqual(memoryRecord.content, goodRule);

  const recalled = memoryStore.recall("LEARNED_PATTERN", memoryRecord.memory_id);
  assert.deepEqual(recalled.content, goodRule);
});

test("Learning pipeline: a rejected candidate is kept (status change), never deleted, with its history intact", () => {
  const c = validateCandidate(proposeCandidate({ kind: "REASONING_RULE", payload: { id: "bad" } }));
  assert.equal(c.status, CandidateStatus.REJECTED);
  assert.equal(c.history[0].status, CandidateStatus.SANDBOXED);
  assert.equal(c.history[1].status, CandidateStatus.REJECTED);
  assert.ok(c.id);
});

test("Learning pipeline: full history is reconstructable across every stage", () => {
  let c = proposeCandidate({ kind: "REASONING_RULE", payload: goodRule });
  c = validateCandidate(c);
  c = regressionTest(c, []);
  c = acceptCandidate(c, { approvedBy: "ashok" });
  const { candidate } = promoteCandidate(c);
  assert.deepEqual(
    candidate.history.map((h) => h.status),
    ["SANDBOXED", "VALIDATED", "REGRESSION_PASSED", "ACCEPTED", "PROMOTED"]
  );
});
