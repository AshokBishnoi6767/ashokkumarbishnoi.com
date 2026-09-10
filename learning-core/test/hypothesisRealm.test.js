"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { proposeHypothesis, addEvidence, withdrawHypothesis, groupHypothesesByProposition } = require("../language/realm/hypothesisRealm");
const { HypothesisStatus, ProbabilityStatus, UncertaintyStatus } = require("../shared/constants");

const telescopeProposition = { id: "prop-1", subject: { surface: "I" }, predicate: "SAW", object: { surface: "the man" } };

test("Hypothesis realm: a freshly proposed hypothesis with no evidence is PROPOSED", () => {
  const h = proposeHypothesis({ proposition: telescopeProposition });
  assert.equal(h.status, HypothesisStatus.PROPOSED);
  assert.deepEqual(h.supporting_evidence, []);
  assert.deepEqual(h.contradicting_evidence, []);
});

test("Hypothesis realm: requires a proposition", () => {
  assert.throws(() => proposeHypothesis({}), TypeError);
  assert.throws(() => proposeHypothesis(), TypeError);
});

test("Hypothesis realm: confidence/probability are caller-supplied only, never computed from evidence count", () => {
  const h = proposeHypothesis({ proposition: telescopeProposition, supportingEvidence: ["e1", "e2", "e3"] });
  assert.equal(h.confidence, null);
  assert.equal(h.probability, ProbabilityStatus.NOT_DEFINED);
  assert.equal(h.uncertainty, UncertaintyStatus.PRESENT);
});

test("Hypothesis realm: supporting evidence only moves status to SUPPORTED", () => {
  const h = proposeHypothesis({ proposition: telescopeProposition, supportingEvidence: ["witness statement"] });
  assert.equal(h.status, HypothesisStatus.SUPPORTED);
});

test("Hypothesis realm: contradicting evidence only moves status to CONTRADICTED", () => {
  const h = proposeHypothesis({ proposition: telescopeProposition, contradictingEvidence: ["counter-statement"] });
  assert.equal(h.status, HypothesisStatus.CONTRADICTED);
});

test("Hypothesis realm: mixed evidence is DISPUTED, never forced to SUPPORTED or CONTRADICTED", () => {
  const h = proposeHypothesis({
    proposition: telescopeProposition,
    supportingEvidence: ["witness A"],
    contradictingEvidence: ["witness B"],
  });
  assert.equal(h.status, HypothesisStatus.DISPUTED);
});

test("Hypothesis realm: two competing hypotheses about the same proposition coexist, neither forced to win", () => {
  // 'I saw the man with the telescope.' -- ambiguous attachment: I used the
  // telescope, OR the man had the telescope. Both are legitimate hypotheses.
  const hIUsedTelescope = proposeHypothesis({
    proposition: telescopeProposition,
    supportingEvidence: ["PP-attachment reading A: 'with the telescope' modifies 'saw'"],
  });
  const hManHadTelescope = proposeHypothesis({
    proposition: telescopeProposition,
    supportingEvidence: ["PP-attachment reading B: 'with the telescope' modifies 'the man'"],
  });

  assert.notEqual(hIUsedTelescope.id, hManHadTelescope.id);
  assert.equal(hIUsedTelescope.status, HypothesisStatus.SUPPORTED);
  assert.equal(hManHadTelescope.status, HypothesisStatus.SUPPORTED);

  const groups = groupHypothesesByProposition([hIUsedTelescope, hManHadTelescope]);
  assert.equal(groups.get("prop-1").length, 2);
});

test("Hypothesis realm: addEvidence returns a new object and recomputes status, never mutating the original", () => {
  const original = proposeHypothesis({ proposition: telescopeProposition });
  const updated = addEvidence(original, { supporting: ["new witness"] });

  assert.notEqual(original, updated);
  assert.equal(original.status, HypothesisStatus.PROPOSED);
  assert.deepEqual(original.supporting_evidence, []);
  assert.equal(updated.status, HypothesisStatus.SUPPORTED);
  assert.deepEqual(updated.supporting_evidence, ["new witness"]);
});

test("Hypothesis realm: addEvidence on a SUPPORTED hypothesis that also gains contradicting evidence becomes DISPUTED", () => {
  const supported = proposeHypothesis({ proposition: telescopeProposition, supportingEvidence: ["a"] });
  const disputed = addEvidence(supported, { contradicting: ["b"] });
  assert.equal(disputed.status, HypothesisStatus.DISPUTED);
});

test("Hypothesis realm: withdrawal is terminal — adding evidence afterward does not revive the hypothesis", () => {
  const h = proposeHypothesis({ proposition: telescopeProposition, supportingEvidence: ["a"] });
  const withdrawn = withdrawHypothesis(h, "superseded by a better-formed hypothesis");
  assert.equal(withdrawn.status, HypothesisStatus.WITHDRAWN);
  assert.equal(withdrawn.withdrawal_reason, "superseded by a better-formed hypothesis");

  const stillWithdrawn = addEvidence(withdrawn, { supporting: ["more evidence"] });
  assert.equal(stillWithdrawn.status, HypothesisStatus.WITHDRAWN);
});

test("Hypothesis realm: withdrawal does not delete the hypothesis, only changes its status", () => {
  const h = proposeHypothesis({ proposition: telescopeProposition });
  const withdrawn = withdrawHypothesis(h);
  assert.equal(withdrawn.id, h.id);
  assert.deepEqual(withdrawn.proposition, telescopeProposition);
});

test("Hypothesis realm: rejects malformed inputs rather than silently coercing", () => {
  assert.throws(() => proposeHypothesis({ proposition: telescopeProposition, supportingEvidence: "not an array" }), TypeError);
  assert.throws(() => addEvidence(null, { supporting: [] }), TypeError);
  assert.throws(() => withdrawHypothesis(null), TypeError);
  assert.throws(() => groupHypothesesByProposition("not an array"), TypeError);
});

test("Hypothesis realm: provenance identifies this realm and a timestamp", () => {
  const h = proposeHypothesis({ proposition: telescopeProposition });
  assert.equal(h.provenance.realm, "HYPOTHESIS");
  assert.ok(!Number.isNaN(Date.parse(h.provenance.created_at)));
});
