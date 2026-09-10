"use strict";

/**
 * Trinity — Learning Engine: Candidate Pipeline v0.1 (M8)
 *
 * This is NOT a parameterized/trainable-model learning system —
 * nothing in this codebase yet has trainable numeric parameters to
 * gradient-descend on (the deterministic realm chain is rule-based by
 * design). What this codebase DOES have that can legitimately "learn"
 * is its explicit Reasoning rules and its Knowledge/Memory facts —
 * and learning/events.js already established the load-bearing
 * principle for that: a user correction is a CANDIDATE, never
 * automatically promoted to persistent truth. This file is the actual
 * gate that principle was waiting for: SANDBOX -> VALIDATE ->
 * REGRESSION TEST -> ACCEPT -> PROMOTE, enforced by status checks that
 * make it structurally impossible to skip a stage.
 *
 * math/engine.js's gradientDescentStep/runGradientDescent already
 * exist for the day a real parameterized transformation shows up in
 * this codebase (R_(n+1) = O_theta(R_n), theta updated by
 * theta_(t+1) = theta_t - eta*gradient(L)) — this pipeline does not
 * duplicate that; it is the governance layer around WHATEVER kind of
 * candidate change is proposed, parameterized or rule-based.
 *
 * === Stages, and why each one exists ===
 *   SANDBOXED          proposeCandidate() — a candidate exists, has
 *                       touched nothing else yet.
 *   VALIDATED           validateCandidate() — structurally well-formed
 *                       for its kind (e.g. a REASONING_RULE matches
 *                       reasoningRealm.js's own rule shape — reused via
 *                       isValidRuleShape, not reimplemented).
 *   REGRESSION_PASSED   regressionTest() — applying the candidate
 *                       against caller-supplied EXISTING accepted
 *                       records introduces no NEW contradiction
 *                       (Reasoning Realm's own checkConsistency,
 *                       reused) beyond whatever already existed in the
 *                       baseline.
 *   ACCEPTED             acceptCandidate() — requires an explicit
 *                       `approvedBy` identity. This is where a human
 *                       decision enters; nothing upstream of this can
 *                       promote on its own.
 *   PROMOTED             promoteCandidate() — writes into the existing
 *                       Memory Engine's LEARNED_PATTERN class (reusing
 *                       memory/store.js, not a new store).
 *   REJECTED              a terminal failure state from any gate,
 *                       carrying the reason. Rejected candidates are
 *                       kept (status change, not deletion) — same
 *                       "never erase, only recorded transition"
 *                       discipline as Hypothesis withdrawal.
 *
 * Every transition function REQUIRES the candidate to already be in
 * the correct prior status, and throws otherwise — there is no code
 * path from SANDBOXED straight to PROMOTED. A bare conversation input
 * can call proposeCandidate() freely; it cannot reach promoteCandidate()
 * without regressionTest() having run and a human having called
 * acceptCandidate() with a real approvedBy value.
 */

const { newMemoryId } = require("../shared/ids");
const { isValidRuleShape, applyRule, checkConsistency } = require("../language/realm/reasoningRealm");
const memoryStore = require("../memory/store");
const { MemoryClass } = require("../shared/constants");

const CandidateStatus = Object.freeze({
  SANDBOXED: "SANDBOXED",
  VALIDATED: "VALIDATED",
  REGRESSION_PASSED: "REGRESSION_PASSED",
  ACCEPTED: "ACCEPTED",
  PROMOTED: "PROMOTED",
  REJECTED: "REJECTED",
});

function withTransition(candidate, status, note) {
  return {
    ...candidate,
    status,
    history: [...candidate.history, { status, at: new Date().toISOString(), note: note || null }],
  };
}

function requireStatus(candidate, expected, fnName) {
  if (!candidate || candidate.status !== expected) {
    throw new TypeError(`${fnName} requires a candidate with status ${expected} (got ${candidate ? candidate.status : "none"}).`);
  }
}

// kind: "REASONING_RULE" | "FACT" (extendable — see module doc; a new
// kind needs its own case in validateCandidate/regressionTest, never a
// silent default that skips validation).
function proposeCandidate({ kind, payload, evidence = [], sourceLearningEvent = null }) {
  if (!kind || !payload) {
    throw new TypeError("proposeCandidate requires `kind` and `payload`.");
  }
  const now = new Date().toISOString();
  return {
    id: newMemoryId(),
    kind,
    payload,
    evidence,
    source_learning_event: sourceLearningEvent,
    status: CandidateStatus.SANDBOXED,
    rejection_reason: null,
    history: [{ status: CandidateStatus.SANDBOXED, at: now, note: null }],
  };
}

function validateCandidate(candidate) {
  requireStatus(candidate, CandidateStatus.SANDBOXED, "validateCandidate");

  let valid = false;
  let reason = null;
  if (candidate.kind === "REASONING_RULE") {
    valid = isValidRuleShape(candidate.payload);
    reason = valid ? null : "Payload does not match the Reasoning Realm's rule shape.";
  } else if (candidate.kind === "FACT") {
    const p = candidate.payload;
    valid = !!(p && p.subject && p.subject.id && typeof p.predicate === "string" && p.object && p.object.id);
    reason = valid ? null : "Payload requires subject.id, predicate, object.id.";
  } else {
    reason = `Unknown candidate kind: ${candidate.kind}. Add explicit validation before accepting this kind.`;
  }

  return valid ? withTransition(candidate, CandidateStatus.VALIDATED) : rejectCandidate(candidate, reason);
}

function rejectCandidate(candidate, reason) {
  return { ...withTransition(candidate, CandidateStatus.REJECTED, reason), rejection_reason: reason };
}

// Applies the candidate against a caller-supplied baseline of EXISTING
// accepted records and checks whether it introduces any NEW
// contradiction beyond whatever already existed in that baseline.
// Only meaningful for kind REASONING_RULE today (a FACT candidate has
// no rule to apply — its "regression test" is simply that adding it
// does not itself conflict with the baseline, checked the same way).
function regressionTest(candidate, baselineRecords = []) {
  requireStatus(candidate, CandidateStatus.VALIDATED, "regressionTest");

  const baselineContradictions = checkConsistency(baselineRecords).length;

  let projectedRecords = baselineRecords;
  if (candidate.kind === "REASONING_RULE") {
    const derived = applyRule(candidate.payload, baselineRecords);
    projectedRecords = [...baselineRecords, ...derived];
  } else if (candidate.kind === "FACT") {
    projectedRecords = [...baselineRecords, candidate.payload];
  }

  const projectedContradictions = checkConsistency(projectedRecords).length;

  if (projectedContradictions > baselineContradictions) {
    return rejectCandidate(
      candidate,
      `Regression failed: introduces ${projectedContradictions - baselineContradictions} new contradiction(s) against the supplied baseline.`
    );
  }
  return withTransition(candidate, CandidateStatus.REGRESSION_PASSED);
}

// The human-decision gate. approvedBy is required and never defaulted
// — there is no "auto-approve" path.
function acceptCandidate(candidate, { approvedBy } = {}) {
  requireStatus(candidate, CandidateStatus.REGRESSION_PASSED, "acceptCandidate");
  if (!approvedBy) {
    throw new TypeError("acceptCandidate requires an explicit `approvedBy` identity — nothing is ever auto-approved.");
  }
  return withTransition(candidate, CandidateStatus.ACCEPTED, `approved_by:${approvedBy}`);
}

// Writes the candidate's payload into the EXISTING Memory Engine's
// LEARNED_PATTERN class (memory/store.js — not a new store). This is
// the only function in this file that has any effect outside the
// candidate object itself, and it requires ACCEPTED.
function promoteCandidate(candidate, { userScope = null } = {}) {
  requireStatus(candidate, CandidateStatus.ACCEPTED, "promoteCandidate");
  const memoryRecord = memoryStore.remember(MemoryClass.LEARNED_PATTERN, {
    type: `learned_${candidate.kind.toLowerCase()}`,
    content: candidate.payload,
    source: "LEARNING_CANDIDATE_PIPELINE",
    sourceReference: candidate.id,
    truthState: "HYPOTHESIS",
    confidence: null,
    relatedEntities: [],
    userScope,
  });
  return { candidate: withTransition(candidate, CandidateStatus.PROMOTED), memoryRecord };
}

module.exports = {
  CandidateStatus,
  proposeCandidate,
  validateCandidate,
  regressionTest,
  acceptCandidate,
  promoteCandidate,
  rejectCandidate,
};
