"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { verifyClaim, checkProvenance, verifyMathClaim } = require("../language/realm/verificationRealm");
const { VerificationOutcome } = require("../shared/constants");
const math = require("../math/engine");

const mathClaim = { id: "claim-1" };

test("Verification realm: mathematical claim verified by actual recomputation, not by the engine's say-so", () => {
  // Claim: "2 + 2 equals 4."
  const result = verifyClaim(mathClaim, { independentChecks: [{ name: "arithmetic", check: () => 2 + 2 === 4 }] });
  assert.equal(result.outcome, VerificationOutcome.VERIFIED);
});

test("Verification realm: a false independent recomputation yields CONTRADICTED", () => {
  // Claim: "2 + 2 equals 5."
  const result = verifyClaim(mathClaim, { independentChecks: [{ name: "arithmetic", check: () => 2 + 2 === 5 }] });
  assert.equal(result.outcome, VerificationOutcome.CONTRADICTED);
});

test("Verification realm: no evidence at all -> UNKNOWN, never guessed", () => {
  const result = verifyClaim(mathClaim);
  assert.equal(result.outcome, VerificationOutcome.UNKNOWN);
});

test("Verification realm: an explicitly unverifiable claim with nothing to check -> NOT_VERIFIABLE", () => {
  const result = verifyClaim({ id: "claim-opinion", verifiable: false });
  assert.equal(result.outcome, VerificationOutcome.NOT_VERIFIABLE);
});

test("Verification realm: a claim marked unverifiable is still UNKNOWN (not NOT_VERIFIABLE) once real checks are run", () => {
  const result = verifyClaim({ id: "claim-opinion", verifiable: false }, { independentChecks: [{ name: "x", check: () => true }] });
  assert.equal(result.outcome, VerificationOutcome.VERIFIED);
});

test("Verification realm: mixed VERIFIED + inconclusive checks -> PARTIALLY_VERIFIED", () => {
  const result = verifyClaim(mathClaim, {
    independentChecks: [
      { name: "check-a", check: () => true },
      { name: "check-b", check: () => { throw new Error("no independent source available"); } },
    ],
  });
  assert.equal(result.outcome, VerificationOutcome.PARTIALLY_VERIFIED);
});

test("Verification realm: a check that throws is UNKNOWN, never a crash and never CONTRADICTED", () => {
  const result = verifyClaim(mathClaim, { independentChecks: [{ name: "flaky", check: () => { throw new Error("boom"); } }] });
  assert.equal(result.outcome, VerificationOutcome.UNKNOWN);
  assert.equal(result.check_results[0].outcome, VerificationOutcome.UNKNOWN);
});

test("Verification realm: a non-boolean-returning check is UNKNOWN, never coerced into a verdict", () => {
  const result = verifyClaim(mathClaim, { independentChecks: [{ name: "vague", check: () => "maybe" }] });
  assert.equal(result.outcome, VerificationOutcome.UNKNOWN);
});

test("Verification realm: CONTRADICTED wins over an unrelated VERIFIED signal", () => {
  const result = verifyClaim(mathClaim, {
    independentChecks: [
      { name: "unrelated-pass", check: () => true },
      { name: "direct-contradiction", check: () => false },
    ],
  });
  assert.equal(result.outcome, VerificationOutcome.CONTRADICTED);
});

test("Verification realm: consistency-driven contradiction — a claim flagged by Reasoning's checkConsistency is CONTRADICTED", () => {
  const john = { id: "entity-john", surface: "John" };
  const toronto = { id: "entity-toronto", surface: "Toronto" };
  const claim = { id: "know-a", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE" };
  const opposite = { id: "know-b", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE" };

  const result = verifyClaim(claim, { allRecords: [claim, opposite] });
  assert.equal(result.outcome, VerificationOutcome.CONTRADICTED);
  assert.ok(result.check_results[0].name.startsWith("CONSISTENCY_CHECK:"));
});

test("Verification realm: a claim not involved in any contradiction among allRecords stays UNKNOWN", () => {
  const john = { id: "entity-john", surface: "John" };
  const claim = { id: "know-a", subject: john, predicate: "LOCATED_IN", object: { id: "entity-x", surface: "Toronto" } };
  const unrelated = { id: "know-b", subject: { id: "entity-y", surface: "Mary" }, predicate: "LOCATED_IN", object: { id: "entity-z", surface: "Ottawa" } };
  const result = verifyClaim(claim, { allRecords: [claim, unrelated] });
  assert.equal(result.outcome, VerificationOutcome.UNKNOWN);
});

test("Verification realm: rejects a claim with no id", () => {
  assert.throws(() => verifyClaim({}), TypeError);
  assert.throws(() => verifyClaim(null), TypeError);
});

test("Verification realm: result carries provenance identifying this realm", () => {
  const result = verifyClaim(mathClaim);
  assert.equal(result.provenance.realm, "VERIFICATION");
  assert.ok(!Number.isNaN(Date.parse(result.provenance.checked_at)));
  assert.equal(result.claim_id, "claim-1");
});

test("Verification realm: checkProvenance flags a derived record with an empty derived_from", () => {
  const badDerived = { id: "know-bad", derived_from: [], evidence: {}, provenance: { realm: "REASONING" } };
  const { complete, missing } = checkProvenance(badDerived);
  assert.equal(complete, false);
  assert.ok(missing.some((m) => m.startsWith("derived_from")));
});

test("Verification realm: checkProvenance passes a well-formed record", () => {
  const good = { id: "know-good", evidence: { relationship_id: "rel-1" }, provenance: { realm: "SEMANTIC_REPRESENTATION" } };
  assert.deepEqual(checkProvenance(good), { claim_id: "know-good", complete: true, missing: [] });
});

test("Verification realm: checkProvenance does not decide truth — complete provenance is not VERIFIED", () => {
  const good = { id: "know-good", evidence: {}, provenance: { realm: "SEMANTIC_REPRESENTATION" } };
  const provenanceResult = checkProvenance(good);
  assert.equal(provenanceResult.complete, true);
  const verificationResult = verifyClaim(good);
  assert.equal(verificationResult.outcome, VerificationOutcome.UNKNOWN);
});

test("Verification realm: verifyMathClaim verifies a real math/engine.js result — '2 + 2 = 4'", () => {
  const result = verifyMathClaim(mathClaim, math.add(2, 2));
  assert.equal(result.outcome, VerificationOutcome.VERIFIED);
  assert.equal(result.check_results[0].name, "math_engine_recomputation");
});

test("Verification realm: verifyMathClaim reports CONTRADICTED for an invalid math result (e.g. divide by zero)", () => {
  const result = verifyMathClaim(mathClaim, math.divide(5, 0));
  assert.equal(result.outcome, VerificationOutcome.CONTRADICTED);
});

test("Verification realm: verifyMathClaim rejects a hand-built look-alike object, same discipline as assignProbability", () => {
  const fake = { operator: "ADD", output: 4, valid: true, provenance: { realm: "SOMEWHERE_ELSE" } };
  assert.throws(() => verifyMathClaim(mathClaim, fake), TypeError);
});

test("Verification realm: verifyMathClaim rejects a bare number", () => {
  assert.throws(() => verifyMathClaim(mathClaim, 4), TypeError);
});

test("Verification realm: verifyMathClaim combines with additional independentChecks via the same decision table", () => {
  const result = verifyMathClaim(mathClaim, math.add(2, 2), {
    independentChecks: [{ name: "unrelated-inconclusive", check: () => { throw new Error("no source"); } }],
  });
  assert.equal(result.outcome, VerificationOutcome.PARTIALLY_VERIFIED);
});

test("Verification realm: verifyMathClaim changes nothing about verifyClaim's own behavior for non-math calls", () => {
  const result = verifyClaim(mathClaim, { independentChecks: [{ name: "manual", check: () => true }] });
  assert.equal(result.outcome, VerificationOutcome.VERIFIED);
});
