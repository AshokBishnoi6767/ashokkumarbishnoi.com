"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { applyRule, applyRules, applyRulesUntilFixedPoint, checkConsistency } = require("../language/realm/reasoningRealm");
const { TruthState } = require("../shared/constants");

function entity(surface, type = "UNKNOWN") {
  return { id: `entity-${surface.toLowerCase()}`, surface, type };
}

function knowledgeRecord({ id, subject, predicate, object, polarity }) {
  return { id, subject, predicate, object, polarity, truth_state: TruthState.UNKNOWN };
}

const birdsFlyRule = { id: "rule-birds-fly", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };

test("Reasoning realm: valid deduction — 'All birds fly. Penguins are birds.' derives 'Penguins can fly.'", () => {
  const penguin = entity("Penguins");
  const premise = knowledgeRecord({ id: "know-1", subject: penguin, predicate: "IS_A", object: entity("bird") });

  const [derived] = applyRule(birdsFlyRule, [premise]);

  assert.equal(derived.subject.surface, "Penguins");
  assert.equal(derived.predicate, "CAN");
  assert.equal(derived.object.surface, "fly");
  assert.equal(derived.truth_state, TruthState.DERIVED);
});

test("Reasoning realm: derived truth_state is never auto-promoted to KNOWN or VERIFIED", () => {
  const premise = knowledgeRecord({ id: "know-1", subject: entity("Penguins"), predicate: "IS_A", object: entity("bird") });
  const [derived] = applyRule(birdsFlyRule, [premise]);
  assert.notEqual(derived.truth_state, TruthState.KNOWN);
  assert.notEqual(derived.truth_state, TruthState.VERIFIED);
});

test("Reasoning realm: provenance of a derived claim names the exact premise and rule", () => {
  const premise = knowledgeRecord({ id: "know-1", subject: entity("Penguins"), predicate: "IS_A", object: entity("bird") });
  const [derived] = applyRule(birdsFlyRule, [premise]);
  assert.deepEqual(derived.derived_from, ["know-1", "rule-birds-fly"]);
  assert.equal(derived.evidence.rule_id, "rule-birds-fly");
  assert.equal(derived.evidence.premise_record_id, "know-1");
  assert.equal(derived.provenance.realm, "REASONING");
});

test("Reasoning realm: missing premise — no matching record yields zero derived facts, never a guess", () => {
  const unrelated = knowledgeRecord({ id: "know-1", subject: entity("Penguins"), predicate: "IS_A", object: entity("mammal") });
  const derived = applyRule(birdsFlyRule, [unrelated]);
  assert.deepEqual(derived, []);
});

test("Reasoning realm: rejects a malformed rule rather than silently ignoring it", () => {
  assert.throws(() => applyRule({ id: "bad" }, []), TypeError);
  assert.throws(() => applyRule(null, []), TypeError);
});

test("Reasoning realm: rejects non-array records input", () => {
  assert.throws(() => applyRule(birdsFlyRule, "not an array"), TypeError);
});

test("Reasoning realm: applyRule never hardcodes world knowledge — an unsupplied rule derives nothing", () => {
  const premise = knowledgeRecord({ id: "know-1", subject: entity("Penguins"), predicate: "IS_A", object: entity("bird") });
  const noOpRule = { id: "rule-noop", if: { predicate: "IS_A", objectSurface: "mammal" }, then: { predicate: "CAN", objectSurface: "swim" } };
  assert.deepEqual(applyRule(noOpRule, [premise]), []);
});

test("Reasoning realm: applyRules runs several rules independently over the same premises", () => {
  const penguin = entity("Penguins");
  const records = [
    knowledgeRecord({ id: "know-1", subject: penguin, predicate: "IS_A", object: entity("bird") }),
  ];
  const swimRule = { id: "rule-birds-swim", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "swim" } };
  const derived = applyRules([birdsFlyRule, swimRule], records);
  assert.equal(derived.length, 2);
  assert.deepEqual(derived.map((d) => d.object.surface).sort(), ["fly", "swim"]);
});

test("Reasoning realm: applyRulesUntilFixedPoint chains derivations across steps, each hop traceable", () => {
  const penguin = entity("Penguins");
  const records = [knowledgeRecord({ id: "know-1", subject: penguin, predicate: "IS_A", object: entity("bird") })];
  const flyRule = { id: "rule-1", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };
  const flyMeansAirborneRule = { id: "rule-2", if: { predicate: "CAN", objectSurface: "fly" }, then: { predicate: "IS", objectSurface: "airborne-capable" } };

  const derived = applyRulesUntilFixedPoint([flyRule, flyMeansAirborneRule], records);
  assert.equal(derived.length, 2);
  const hop2 = derived.find((d) => d.object.surface === "airborne-capable");
  assert.ok(hop2);
  assert.equal(hop2.derived_from[1], "rule-2");
});

test("Reasoning realm: deterministic results — same rule/records yields structurally identical derived facts except ids", () => {
  const premise = knowledgeRecord({ id: "know-1", subject: entity("Penguins"), predicate: "IS_A", object: entity("bird") });
  const [a] = applyRule(birdsFlyRule, [premise]);
  const [b] = applyRule(birdsFlyRule, [premise]);
  assert.notEqual(a.id, b.id);
  assert.equal(a.subject.surface, b.subject.surface);
  assert.equal(a.predicate, b.predicate);
  assert.equal(a.object.surface, b.object.surface);
  assert.equal(a.truth_state, b.truth_state);
});

test("Reasoning realm: contradictory premises via explicit polarity — 'John is in Toronto.' / 'John is not in Toronto.'", () => {
  const john = entity("John", "PERSON");
  const toronto = entity("Toronto", "LOCATION");
  const positive = knowledgeRecord({ id: "know-a", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE" });
  const negative = knowledgeRecord({ id: "know-b", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE" });

  const contradictions = checkConsistency([positive, negative]);
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].type, "POLARITY_CONTRADICTION");
  assert.equal(contradictions[0].status, "CONTRADICTION_PRESENT");
  assert.deepEqual(contradictions[0].conflicting_records.sort(), ["know-a", "know-b"]);
});

test("Reasoning realm (Phase 5, real chain): 'John is in Toronto.' / 'John is not in Toronto.' — predicate AND polarity now come from real parsing, not hand-built records", () => {
  const { extractKnowledge } = require("../language/realm/knowledgeRealm");
  const { tokenize } = require("../language/realm/tokenRealm");
  const extract = (text) => extractKnowledge(text, tokenize(text).tokens).records[0];

  const positive = extract("John is in Toronto.");
  const negative = extract("John is not in Toronto.");
  assert.equal(positive.polarity, "POSITIVE");
  assert.equal(negative.polarity, "NEGATIVE");
  assert.equal(positive.predicate, negative.predicate);

  // Each independent extraction mints its own entity mention — this
  // realm never resolves "the John in sentence 1" and "the John in
  // sentence 2" as the same real-world referent (that is a future
  // Coreference/Context realm's job, out of scope here). Unifying
  // subject identity here simulates what that later realm will
  // eventually hand checkConsistency; everything else (predicate,
  // polarity) is genuine output of this milestone's own parsing.
  assert.notEqual(positive.subject.id, negative.subject.id);
  const unifiedNegative = { ...negative, subject: positive.subject };

  const contradictions = checkConsistency([positive, unifiedNegative]);
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].type, "POLARITY_CONTRADICTION");
  assert.deepEqual(contradictions[0].conflicting_records.sort(), [positive.id, unifiedNegative.id].sort());
});

test("Reasoning realm: contradiction is never silently resolved — both records remain, neither deleted or flagged as the winner", () => {
  const john = entity("John", "PERSON");
  const toronto = entity("Toronto", "LOCATION");
  const positive = knowledgeRecord({ id: "know-a", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE" });
  const negative = knowledgeRecord({ id: "know-b", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE" });
  checkConsistency([positive, negative]);
  assert.equal(positive.truth_state, TruthState.UNKNOWN);
  assert.equal(negative.truth_state, TruthState.UNKNOWN);
});

test("Reasoning realm: consistent records (no polarity conflict, no constraint) yield zero contradictions", () => {
  const john = entity("John", "PERSON");
  const record = knowledgeRecord({ id: "know-a", subject: john, predicate: "LOCATED_IN", object: entity("Toronto") });
  assert.deepEqual(checkConsistency([record]), []);
});

test("Reasoning realm: explicit SINGLE_VALUE constraint catches a caller-declared exclusivity violation", () => {
  const john = entity("John", "PERSON");
  const records = [
    knowledgeRecord({ id: "know-a", subject: john, predicate: "HOME_CITY", object: entity("Toronto") }),
    knowledgeRecord({ id: "know-b", subject: john, predicate: "HOME_CITY", object: entity("Vancouver") }),
  ];
  const contradictions = checkConsistency(records, { constraints: [{ predicate: "HOME_CITY", exclusivity: "SINGLE_VALUE" }] });
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].type, "CONSTRAINT_CONTRADICTION");
  assert.deepEqual(contradictions[0].conflicting_records.sort(), ["know-a", "know-b"]);
});

test("Reasoning realm: no constraint declared means no constraint contradiction is invented", () => {
  const john = entity("John", "PERSON");
  const records = [
    knowledgeRecord({ id: "know-a", subject: john, predicate: "HOME_CITY", object: entity("Toronto") }),
    knowledgeRecord({ id: "know-b", subject: john, predicate: "HOME_CITY", object: entity("Vancouver") }),
  ];
  assert.deepEqual(checkConsistency(records), []);
});

test("Reasoning realm: rejects non-array constraints input", () => {
  assert.throws(() => checkConsistency([], { constraints: "not an array" }), TypeError);
});
