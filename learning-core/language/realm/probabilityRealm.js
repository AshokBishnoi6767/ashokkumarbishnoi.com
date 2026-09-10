"use strict";

/**
 * Trinity — Probability / Uncertainty Realm v0.1
 *
 * Sits alongside Verification, gatekeeping the ONE sanctioned path by
 * which any Proposition/KnowledgeRecord/Hypothesis/derived-record's
 * `probability` field is ever allowed to move away from
 * ProbabilityStatus.NOT_DEFINED, and the one sanctioned path by which
 * `uncertainty` ever moves away from UncertaintyStatus.PRESENT. Every
 * realm below this one (Semantic, Knowledge, Reasoning, Hypothesis)
 * already refuses to invent either value — this realm is where a
 * REAL, justified value is allowed in, and only there.
 *
 * === assignProbability: math.engine output only, never a bare number ===
 * assignProbability() does not accept a plain number. It requires a
 * result object produced by learning-core/math/engine.js's own
 * bayesRule/conditionalProbability/expectedValue (or any function
 * returning that same {operator, input, output, valid, provenance}
 * shape) with `valid: true`. This is the concrete mechanism behind
 * the recurring rule across this codebase: "John may be angry." must
 * never receive probability = 0.72 unless a real model actually
 * computed 0.72 — here, that means someone actually called
 * math.bayesRule(...) (or similar) with real inputs and got a valid
 * result back. A caller cannot shortcut this by constructing a
 * look-alike object; `mathResult.provenance.realm` must equal
 * "MATHEMATICAL_ENGINE".
 *
 * === resolveUncertainty: only Verification can clear PRESENT ===
 * The only way `uncertainty` ever becomes UncertaintyStatus.ABSENT is
 * a VerificationOutcome.VERIFIED result from the Verification Realm,
 * passed in directly (not re-derived, not inferred from confidence or
 * probability — see shared/constants.js's UncertaintyStatus comment).
 * Every other outcome (PARTIALLY_VERIFIED, CONTRADICTED, UNKNOWN,
 * NOT_VERIFIABLE) leaves uncertainty PRESENT — a contradicted claim is
 * not "certain," it is disputed, which is exactly what
 * TruthState/HypothesisStatus already represent; uncertainty is not
 * overloaded to also carry that distinction.
 *
 * === representDistribution: validates, does not compute ===
 * A discrete probability distribution is only ever represented as
 * given, never auto-normalized — a distribution whose probabilities
 * don't sum to 1 (within floating-point tolerance) or that contains a
 * negative probability is reported invalid, not silently corrected.
 */

const { ProbabilityStatus, UncertaintyStatus, VerificationOutcome } = require("../../shared/constants");

function isValidMathResult(mathResult) {
  return (
    mathResult &&
    mathResult.valid === true &&
    typeof mathResult.operator === "string" &&
    mathResult.provenance &&
    mathResult.provenance.realm === "MATHEMATICAL_ENGINE" &&
    (typeof mathResult.output === "number" || (mathResult.output && typeof mathResult.output === "object"))
  );
}

// Pure update: returns a NEW record with `probability` set from a
// valid Mathematical Engine result, never mutating the record passed
// in. Throws rather than silently ignoring an invalid/missing/
// fabricated math result — there is no fallback path to a guessed
// number.
function assignProbability(record, mathResult) {
  if (!record || typeof record !== "object") {
    throw new TypeError("assignProbability requires a record object (Proposition, KnowledgeRecord, Hypothesis, or similar).");
  }
  if (!isValidMathResult(mathResult)) {
    throw new TypeError(
      "assignProbability requires a valid result object from math/engine.js (e.g. bayesRule/conditionalProbability/expectedValue) with valid: true. A bare number is never accepted."
    );
  }
  if (typeof mathResult.output !== "number") {
    throw new TypeError("assignProbability requires a math result whose output is a single number (e.g. bayesRule, not a matrix operation).");
  }

  return {
    ...record,
    probability: mathResult.output,
    probability_provenance: {
      realm: "PROBABILITY_UNCERTAINTY",
      method: mathResult.operator,
      input: mathResult.input,
      computed_at: mathResult.provenance.computed_at,
      assigned_at: new Date().toISOString(),
    },
  };
}

// Pure update: only a VerificationOutcome.VERIFIED result clears
// uncertainty to ABSENT. Every other outcome leaves it PRESENT.
function resolveUncertainty(record, verificationResult) {
  if (!record || typeof record !== "object") {
    throw new TypeError("resolveUncertainty requires a record object.");
  }
  if (!verificationResult || typeof verificationResult.outcome !== "string") {
    throw new TypeError("resolveUncertainty requires a Verification Realm result (see verificationRealm.js#verifyClaim).");
  }

  const uncertainty = verificationResult.outcome === VerificationOutcome.VERIFIED ? UncertaintyStatus.ABSENT : UncertaintyStatus.PRESENT;

  return {
    ...record,
    uncertainty,
    uncertainty_provenance: {
      realm: "PROBABILITY_UNCERTAINTY",
      resolved_by_verification_id: verificationResult.id || null,
      outcome: verificationResult.outcome,
      resolved_at: new Date().toISOString(),
    },
  };
}

// Validates (never computes or normalizes) a discrete probability
// distribution: [{ label, probability }, ...].
function representDistribution(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return { valid: false, error: "A distribution requires a non-empty array of { label, probability } outcomes.", outcomes: null, total_probability: null };
  }
  const negative = outcomes.find((o) => typeof o.probability !== "number" || o.probability < 0);
  if (negative) {
    return { valid: false, error: `Negative or non-numeric probability for "${negative.label}".`, outcomes: null, total_probability: null };
  }
  const total = outcomes.reduce((s, o) => s + o.probability, 0);
  if (Math.abs(total - 1) > 1e-9) {
    return { valid: false, error: `Probabilities must sum to 1; got ${total}.`, outcomes: null, total_probability: total };
  }
  return { valid: true, error: null, outcomes, total_probability: total };
}

module.exports = { assignProbability, resolveUncertainty, representDistribution };
