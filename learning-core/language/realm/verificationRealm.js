"use strict";

/**
 * Trinity — Verification Realm v0.1
 *
 * Sits above Hypothesis:
 *
 *   ... -> REASONING -> HYPOTHESIS -> VERIFICATION -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: given a claim (a Proposition, KnowledgeRecord,
 * derived Reasoning record, or Hypothesis — this realm only ever reads
 * `id`, never assumes a specific shape beyond that) and whatever
 * independent checks/evidence/records the caller already has, decide
 * one of five VerificationOutcome values. It never fabricates evidence
 * and never treats "the engine produced this claim" as evidence for
 * it — see the module-level rule below.
 *
 * === A generated/derived claim is not verified by existing ===
 * verifyClaim() never inspects the claim's own truth_state, source, or
 * the fact that it was successfully extracted/derived as a signal.
 * Only `independentChecks` (caller-supplied functions that recompute
 * or re-evaluate the claim from something OTHER than the claim itself
 * — e.g. actual arithmetic for a math claim, an independent logical
 * evaluator for a logic claim, a lookup against a separate source for
 * a factual claim), `allRecords`+`constraints` (fed to the Reasoning
 * Realm's own checkConsistency to look for CONTRADICTION_PRESENT), and
 * an explicit `verifiable: false` flag ever move the outcome away from
 * UNKNOWN.
 *
 * === This is NOT verification/verify.js ===
 * That pre-existing module answers "did executing a tool/action
 * actually produce the expected result" (SUCCESS/UNKNOWN, from
 * shared/constants.js's ResultStatus) for the action lifecycle. This
 * realm answers a different question — "is this represented CLAIM
 * true" — with a different, richer vocabulary
 * (VerificationOutcome.VERIFIED/PARTIALLY_VERIFIED/CONTRADICTED/
 * UNKNOWN/NOT_VERIFIABLE). Same "an independent check, not the
 * subject's own say-so, decides" philosophy; different question,
 * different module, no shared state. Reuses shared/constants.js's
 * VerificationOutcome (added for exactly this realm).
 *
 * === Decision table (deterministic, no priority ambiguity) ===
 *  0 checks run AND claim.verifiable === false  -> NOT_VERIFIABLE
 *  0 checks run (everything else)               -> UNKNOWN
 *  any check/consistency signal CONTRADICTED    -> CONTRADICTED (wins over any VERIFIED signal — a single solid contradiction outweighs unrelated confirmations)
 *  all ran checks VERIFIED (>=1 ran)             -> VERIFIED
 *  a mix of VERIFIED and UNKNOWN (no CONTRADICTED) -> PARTIALLY_VERIFIED
 *  all ran checks UNKNOWN                        -> UNKNOWN
 *
 * === verifyMathClaim: a first-class math backend, added once one existed ===
 * When this realm was first built, math/engine.js did not exist yet, so a
 * math claim's independentCheck had to be a hand-written recompute
 * function (e.g. `() => 2 + 2 === 4`). Now that math/engine.js does
 * exist, verifyMathClaim() is a pure additive convenience: it takes a
 * REAL result object math/engine.js already produced and folds it into
 * an independentCheck automatically, via the exact same verifyClaim()
 * decision table above — no new outcome logic, no change to verifyClaim
 * itself. It still never trusts a hand-built look-alike object: the
 * same provenance.realm === "MATHEMATICAL_ENGINE" check
 * probabilityRealm.js's assignProbability() already established is
 * reused here.
 */

const { newVerificationId } = require("../../shared/ids");
const { VerificationOutcome } = require("../../shared/constants");
const { checkConsistency } = require("./reasoningRealm");

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array (pass [] if there are none).`);
  }
  return value;
}

// Runs one named independent check safely: a throwing or non-function
// check is UNKNOWN, never a crash and never silently treated as
// CONTRADICTED or VERIFIED.
function runCheck(namedCheck) {
  const { name, check } = namedCheck;
  if (typeof check !== "function") {
    return { name, outcome: VerificationOutcome.UNKNOWN, reason: "No independent check function provided." };
  }
  try {
    const result = check();
    if (result === true) return { name, outcome: VerificationOutcome.VERIFIED };
    if (result === false) return { name, outcome: VerificationOutcome.CONTRADICTED };
    return { name, outcome: VerificationOutcome.UNKNOWN, reason: "Independent check did not return a boolean." };
  } catch (err) {
    return { name, outcome: VerificationOutcome.UNKNOWN, reason: "Independent check threw: " + err.message };
  }
}

function verifyClaim(claim, { independentChecks = [], allRecords = [], constraints = [] } = {}) {
  if (!claim || !claim.id) {
    throw new TypeError("verifyClaim requires a claim object with an `id` (Proposition, KnowledgeRecord, derived record, or Hypothesis).");
  }
  requireArray(independentChecks, "independentChecks");
  requireArray(allRecords, "allRecords");
  requireArray(constraints, "constraints");

  const checkResults = independentChecks.map(runCheck);

  const contradictions = allRecords.length
    ? checkConsistency(allRecords, { constraints }).filter((c) => c.conflicting_records.includes(claim.id))
    : [];
  for (const contradiction of contradictions) {
    checkResults.push({ name: `CONSISTENCY_CHECK:${contradiction.type}`, outcome: VerificationOutcome.CONTRADICTED });
  }

  let outcome;
  let reason = null;
  if (checkResults.length === 0) {
    if (claim.verifiable === false) {
      outcome = VerificationOutcome.NOT_VERIFIABLE;
      reason = "Claim explicitly marked not verifiable by this mechanism.";
    } else {
      outcome = VerificationOutcome.UNKNOWN;
      reason = "No independent check, consistency evidence, or record set was supplied.";
    }
  } else if (checkResults.some((r) => r.outcome === VerificationOutcome.CONTRADICTED)) {
    outcome = VerificationOutcome.CONTRADICTED;
  } else if (checkResults.every((r) => r.outcome === VerificationOutcome.VERIFIED)) {
    outcome = VerificationOutcome.VERIFIED;
  } else if (checkResults.some((r) => r.outcome === VerificationOutcome.VERIFIED)) {
    outcome = VerificationOutcome.PARTIALLY_VERIFIED;
  } else {
    outcome = VerificationOutcome.UNKNOWN;
    reason = "Every independent check was inconclusive.";
  }

  return {
    id: newVerificationId(),
    claim_id: claim.id,
    outcome,
    reason,
    check_results: checkResults,
    provenance: {
      realm: "VERIFICATION",
      checked_at: new Date().toISOString(),
    },
  };
}

// Provenance checking: is the claim's own evidence/provenance chain
// structurally complete? This does not decide truth — a claim can have
// perfect provenance and still be false, or missing provenance and
// still be true (provenance is not verification, see module header).
function checkProvenance(claim) {
  if (!claim || !claim.id) {
    throw new TypeError("checkProvenance requires a claim object with an `id`.");
  }
  const missing = [];
  if (!claim.provenance) missing.push("provenance");
  if (claim.derived_from !== undefined && (!Array.isArray(claim.derived_from) || claim.derived_from.length === 0)) {
    missing.push("derived_from (present but empty — a derived claim must name its premises)");
  }
  if (claim.evidence === undefined) missing.push("evidence");
  return { claim_id: claim.id, complete: missing.length === 0, missing };
}

function isRealMathResult(mathResult) {
  return !!(mathResult && typeof mathResult.operator === "string" && mathResult.provenance && mathResult.provenance.realm === "MATHEMATICAL_ENGINE");
}

// Convenience wrapper: verifies a claim using a REAL math/engine.js
// result as the sole independent check. `mathResult.valid` decides the
// outcome the same way a hand-written `() => 2 + 2 === 4` would have —
// this changes nothing about verifyClaim()'s own decision table, it
// only saves the caller from writing that closure by hand for a math
// claim. Additional independentChecks/allRecords/constraints may still
// be supplied and are combined exactly as verifyClaim() already does.
function verifyMathClaim(claim, mathResult, { checkName = "math_engine_recomputation", independentChecks = [], allRecords = [], constraints = [] } = {}) {
  if (!isRealMathResult(mathResult)) {
    throw new TypeError(
      "verifyMathClaim requires a real result object from math/engine.js (checked via provenance.realm === \"MATHEMATICAL_ENGINE\") — a hand-built look-alike is rejected, same discipline as probabilityRealm.js#assignProbability."
    );
  }
  return verifyClaim(claim, {
    independentChecks: [{ name: checkName, check: () => mathResult.valid === true }, ...independentChecks],
    allRecords,
    constraints,
  });
}

module.exports = { verifyClaim, checkProvenance, verifyMathClaim };
