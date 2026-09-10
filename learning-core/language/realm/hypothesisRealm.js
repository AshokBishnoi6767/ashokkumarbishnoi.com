"use strict";

/**
 * Trinity — Hypothesis Realm v0.1
 *
 * Sits above Reasoning:
 *
 *   ... -> CONTEXT REPRESENTATION -> REASONING -> HYPOTHESIS -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: represent a candidate explanation as an
 * explicit, addressable Hypothesis object — evidence for and against
 * it, its own epistemic fields, and a status derived mechanically from
 * the evidence it was given. It never decides which of several
 * competing hypotheses about the same proposition is "the" answer;
 * that is an authorized evaluation mechanism's job (Verification),
 * never this realm's.
 *
 * === Status is computed from evidence shape, never guessed ===
 * PROPOSED   — no supporting or contradicting evidence yet.
 * SUPPORTED  — supporting evidence exists, no contradicting evidence.
 * CONTRADICTED — contradicting evidence exists, no supporting evidence.
 * DISPUTED   — both exist. This is NOT collapsed into either SUPPORTED
 *              or CONTRADICTED — see shared/constants.js's comment on
 *              HypothesisStatus.DISPUTED. A hypothesis with mixed
 *              evidence stays visibly unresolved rather than being
 *              forced toward a side.
 * WITHDRAWN  — set only by withdrawHypothesis(), and terminal: once
 *              withdrawn, adding more evidence never silently revives
 *              a hypothesis back to PROPOSED/SUPPORTED/etc. Reviving
 *              one requires proposing a new hypothesis explicitly.
 *
 * === Confidence vs. probability, still separate here ===
 * A hypothesis's `confidence` is whatever nullable number the caller
 * supplies (or null) — this realm never computes one from the number
 * of supporting/contradicting evidence entries (that would be exactly
 * the "confidence as a vote count" fabrication this architecture
 * forbids). `probability` stays ProbabilityStatus.NOT_DEFINED unless
 * the caller already has a mathematically justified value. Neither is
 * ever derived from the other, and uncertainty is never computed as
 * 1-confidence or 1-probability — it is always UncertaintyStatus.
 * PRESENT, because a hypothesis is, by definition, not yet verified.
 *
 * === Multiple competing hypotheses ===
 * proposeHypothesis() is called once per candidate explanation; two
 * hypotheses about the same proposition are simply two separate
 * objects, never merged. groupHypothesesByProposition() is a read-only
 * convenience for finding them together — it groups, it does not rank
 * or select.
 */

const { newHypothesisId } = require("../../shared/ids");
const { HypothesisStatus, ProbabilityStatus, UncertaintyStatus } = require("../../shared/constants");

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array (pass [] if there are none).`);
  }
  return value;
}

function computeStatus(supportingEvidence, contradictingEvidence, previousStatus) {
  if (previousStatus === HypothesisStatus.WITHDRAWN) return HypothesisStatus.WITHDRAWN;
  const hasSupport = supportingEvidence.length > 0;
  const hasContradiction = contradictingEvidence.length > 0;
  if (hasSupport && hasContradiction) return HypothesisStatus.DISPUTED;
  if (hasSupport) return HypothesisStatus.SUPPORTED;
  if (hasContradiction) return HypothesisStatus.CONTRADICTED;
  return HypothesisStatus.PROPOSED;
}

// Pure constructor: given a proposition (or KnowledgeRecord, or any
// object reference this hypothesis is about) and whatever evidence/
// constraints the caller already has, produce one Hypothesis object.
function proposeHypothesis({
  proposition,
  supportingEvidence = [],
  contradictingEvidence = [],
  confidence = null,
  probability = ProbabilityStatus.NOT_DEFINED,
  constraints = [],
} = {}) {
  if (!proposition) {
    throw new TypeError("proposeHypothesis requires a `proposition` (or other object) the hypothesis is about.");
  }
  requireArray(supportingEvidence, "supportingEvidence");
  requireArray(contradictingEvidence, "contradictingEvidence");
  requireArray(constraints, "constraints");

  return {
    id: newHypothesisId(),
    proposition,
    supporting_evidence: supportingEvidence,
    contradicting_evidence: contradictingEvidence,
    confidence,
    probability,
    uncertainty: UncertaintyStatus.PRESENT,
    constraints,
    status: computeStatus(supportingEvidence, contradictingEvidence, null),
    provenance: {
      realm: "HYPOTHESIS",
      created_at: new Date().toISOString(),
    },
  };
}

// Pure update: returns a NEW hypothesis with the additional evidence
// appended (never mutates the one passed in) and status recomputed
// from the resulting evidence shape. A WITHDRAWN hypothesis stays
// WITHDRAWN — see module doc.
function addEvidence(hypothesis, { supporting = [], contradicting = [] } = {}) {
  if (!hypothesis || !hypothesis.id) {
    throw new TypeError("addEvidence requires a Hypothesis object (see proposeHypothesis).");
  }
  requireArray(supporting, "supporting");
  requireArray(contradicting, "contradicting");

  const supporting_evidence = [...hypothesis.supporting_evidence, ...supporting];
  const contradicting_evidence = [...hypothesis.contradicting_evidence, ...contradicting];

  return {
    ...hypothesis,
    supporting_evidence,
    contradicting_evidence,
    status: computeStatus(supporting_evidence, contradicting_evidence, hypothesis.status),
  };
}

// Pure update: marks a hypothesis WITHDRAWN. The hypothesis is
// returned, not deleted — withdrawal is a recorded status change, not
// erasure of the fact it was once proposed.
function withdrawHypothesis(hypothesis, reason = null) {
  if (!hypothesis || !hypothesis.id) {
    throw new TypeError("withdrawHypothesis requires a Hypothesis object (see proposeHypothesis).");
  }
  return {
    ...hypothesis,
    status: HypothesisStatus.WITHDRAWN,
    withdrawal_reason: reason,
  };
}

// Read-only grouping by the referenced proposition's id — a
// convenience for finding competing hypotheses together. Never ranks,
// never picks one, never merges two hypotheses into one.
function groupHypothesesByProposition(hypotheses) {
  requireArray(hypotheses, "hypotheses");
  const groups = new Map();
  for (const hypothesis of hypotheses) {
    const key = hypothesis && hypothesis.proposition && hypothesis.proposition.id;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hypothesis);
  }
  return groups;
}

module.exports = { proposeHypothesis, addEvidence, withdrawHypothesis, groupHypothesesByProposition };
