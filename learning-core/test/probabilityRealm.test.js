"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { assignProbability, resolveUncertainty, representDistribution } = require("../language/realm/probabilityRealm");
const math = require("../math/engine");
const { ProbabilityStatus, UncertaintyStatus, VerificationOutcome } = require("../shared/constants");

const record = { id: "know-1", probability: ProbabilityStatus.NOT_DEFINED, uncertainty: UncertaintyStatus.PRESENT };

test("Probability realm: assigns a real probability from a valid math engine Bayes result", () => {
  const bayes = math.bayesRule({ pBGivenA: 0.99, pA: 0.01, pB: 0.0198 });
  const updated = assignProbability(record, bayes);
  assert.equal(updated.probability, 0.5);
  assert.equal(updated.probability_provenance.method, "BAYES_RULE");
});

test("Probability realm: assignProbability never mutates the original record", () => {
  const bayes = math.bayesRule({ pBGivenA: 0.99, pA: 0.01, pB: 0.0198 });
  assignProbability(record, bayes);
  assert.equal(record.probability, ProbabilityStatus.NOT_DEFINED);
});

test("Probability realm: rejects a bare number — 'John may be angry.' cannot receive probability=0.72 without a computation", () => {
  assert.throws(() => assignProbability(record, 0.72), TypeError);
});

test("Probability realm: rejects an invalid (failed) math engine result", () => {
  const failedBayes = math.bayesRule({ pBGivenA: 0.5, pA: 0.5, pB: 0 }); // P(B)=0 -> invalid
  assert.equal(failedBayes.valid, false);
  assert.throws(() => assignProbability(record, failedBayes), TypeError);
});

test("Probability realm: rejects a look-alike object that isn't actually from the math engine", () => {
  const fake = { operator: "BAYES_RULE", output: 0.72, valid: true, provenance: { realm: "SOMEWHERE_ELSE" } };
  assert.throws(() => assignProbability(record, fake), TypeError);
});

test("Probability realm: rejects a math result whose output isn't a single number (e.g. a matrix op)", () => {
  const matrixResult = math.identity(2);
  assert.throws(() => assignProbability(record, matrixResult), TypeError);
});

test("Probability realm: resolveUncertainty clears to ABSENT only on VerificationOutcome.VERIFIED", () => {
  const verified = { id: "verif-1", outcome: VerificationOutcome.VERIFIED };
  const updated = resolveUncertainty(record, verified);
  assert.equal(updated.uncertainty, UncertaintyStatus.ABSENT);
  assert.equal(updated.uncertainty_provenance.outcome, VerificationOutcome.VERIFIED);
});

test("Probability realm: resolveUncertainty leaves PRESENT for every non-VERIFIED outcome", () => {
  for (const outcome of [VerificationOutcome.PARTIALLY_VERIFIED, VerificationOutcome.CONTRADICTED, VerificationOutcome.UNKNOWN, VerificationOutcome.NOT_VERIFIABLE]) {
    const updated = resolveUncertainty(record, { id: "verif-x", outcome });
    assert.equal(updated.uncertainty, UncertaintyStatus.PRESENT, `outcome ${outcome} should leave uncertainty PRESENT`);
  }
});

test("Probability realm: resolveUncertainty never mutates the original record", () => {
  resolveUncertainty(record, { id: "verif-1", outcome: VerificationOutcome.VERIFIED });
  assert.equal(record.uncertainty, UncertaintyStatus.PRESENT);
});

test("Probability realm: rejects a resolveUncertainty call with no verification result", () => {
  assert.throws(() => resolveUncertainty(record, null), TypeError);
  assert.throws(() => resolveUncertainty(record, { reason: "no outcome field" }), TypeError);
});

test("Probability realm: representDistribution accepts a fair coin distribution", () => {
  const r = representDistribution([{ label: "heads", probability: 0.5 }, { label: "tails", probability: 0.5 }]);
  assert.equal(r.valid, true);
  assert.equal(r.total_probability, 1);
});

test("Probability realm: representDistribution rejects a distribution that doesn't sum to 1, never auto-normalizing it", () => {
  const r = representDistribution([{ label: "a", probability: 0.3 }, { label: "b", probability: 0.3 }]);
  assert.equal(r.valid, false);
  assert.match(r.error, /sum to 1/);
});

test("Probability realm: representDistribution rejects a negative probability", () => {
  const r = representDistribution([{ label: "a", probability: -0.1 }, { label: "b", probability: 1.1 }]);
  assert.equal(r.valid, false);
});

test("Probability realm: representDistribution rejects an empty distribution", () => {
  assert.equal(representDistribution([]).valid, false);
});
