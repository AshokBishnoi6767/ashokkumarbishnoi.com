"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { extractPropositions } = require("../language/realm/semanticRealm");
const { EntityType } = require("../language/realm/entityRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { TruthState, ProbabilityStatus, UncertaintyStatus } = require("../shared/constants");

function extract(text, opts) {
  const { tokens } = tokenize(text);
  return extractPropositions(text, tokens, opts);
}

function simplify(prop) {
  return { subject: prop.subject.surface, predicate: prop.predicate, object: prop.object.surface };
}

test("Semantic realm: rejects invalid input", () => {
  const result = extractPropositions(null, null);
  assert.equal(result.state, 0);
  assert.ok(result.reason);
  assert.deepEqual(result.propositions, []);
});

test("1. 'Dog bites man.' -> a Proposition with explicit subject/predicate/object, referencing entity-mention-shaped objects with ids", () => {
  const result = extract("Dog bites man.");
  assert.equal(result.propositions.length, 1);
  const prop = result.propositions[0];
  assert.deepEqual(simplify(prop), { subject: "Dog", predicate: "BITES", object: "man" });
  assert.ok(prop.id);
  assert.ok(prop.subject.id);
  assert.ok(prop.object.id);
  assert.notEqual(prop.subject.id, prop.object.id);
  assert.equal(prop.subject.type, EntityType.UNKNOWN);
});

test("2. 'Man bites dog.' -> a genuinely different proposition (subject/object swapped, not equivalent to test 1)", () => {
  const dogBitesMan = extract("Dog bites man.").propositions[0];
  const manBitesDog = extract("Man bites dog.").propositions[0];
  assert.deepEqual(simplify(manBitesDog), { subject: "Man", predicate: "BITES", object: "dog" });
  assert.notEqual(simplify(dogBitesMan).subject, simplify(manBitesDog).subject);
  assert.equal(simplify(dogBitesMan).subject.toLowerCase(), simplify(manBitesDog).object.toLowerCase());
});

test("3. 'John works at Google.' -> WORKS_AT proposition, subject/object reference real PERSON/ORGANIZATION entity mentions", () => {
  const result = extract("John works at Google.");
  assert.equal(result.propositions.length, 1);
  const prop = result.propositions[0];
  assert.deepEqual(simplify(prop), { subject: "John", predicate: "WORKS_AT", object: "Google" });
  assert.equal(prop.subject.type, EntityType.PERSON);
  assert.equal(prop.object.type, EntityType.ORGANIZATION);
});

test("4. 'Google works with John.' -> direction matters: different proposition from test 3, not just relabeled", () => {
  const result = extract("Google works with John.");
  assert.equal(result.propositions.length, 1);
  const prop = result.propositions[0];
  assert.deepEqual(simplify(prop), { subject: "Google", predicate: "WORKS_WITH", object: "John" });
  assert.equal(prop.subject.type, EntityType.ORGANIZATION);
  assert.equal(prop.object.type, EntityType.PERSON);
});

test("5. 'John works at Google in Toronto.' -> two explicit propositions preserved, sharing one subject entity id", () => {
  const result = extract("John works at Google in Toronto.");
  assert.equal(result.propositions.length, 2);
  const [atGoogle, inToronto] = result.propositions;
  assert.deepEqual(simplify(atGoogle), { subject: "John", predicate: "WORKS_AT", object: "Google" });
  assert.deepEqual(simplify(inToronto), { subject: "John", predicate: "WORKS_IN", object: "Toronto" });
  assert.equal(atGoogle.subject.id, inToronto.subject.id);
  assert.notEqual(atGoogle.id, inToronto.id);
  assert.equal(inToronto.object.type, EntityType.LOCATION);
});

test("6. 'The fastest cat runs.' -> an intransitive clause must not manufacture an object proposition", () => {
  const result = extract("The fastest cat runs.");
  assert.equal(result.state, 1);
  assert.deepEqual(result.propositions, []);
  assert.ok(result.reason);
});

test("7. 'The big red ball.' -> no verb at all; remains unresolved per upstream syntax behavior, not guessed", () => {
  const result = extract("The big red ball.");
  assert.equal(result.state, 1);
  assert.deepEqual(result.propositions, []);
  assert.ok(result.reason);
});

test("8. 'John met John.' -> honestly zero propositions ('met' is not a recognized verb pivot in this architecture); no fabricated relation", () => {
  const result = extract("John met John.");
  assert.deepEqual(result.propositions, []);
  assert.ok(result.reason);
});

test("8b. 'John chased John.' -> mention identity distinctions preserved: same surface form, different subject/object ids", () => {
  const result = extract("John chased John.");
  assert.equal(result.propositions.length, 1);
  const prop = result.propositions[0];
  assert.equal(prop.subject.surface, "John");
  assert.equal(prop.object.surface, "John");
  assert.notEqual(prop.subject.id, prop.object.id);
});

test("9. Evidence linkage: every proposition is traceable back to its Relationship Realm evidence", () => {
  const text = "John works at Google.";
  const result = extract(text);

  assert.equal(result.propositions.length, 1);
  const prop = result.propositions[0];

  // The relationship id is generated fresh per extraction call (same as
  // entity ids), so cross-call identity is not the contract here — what
  // must hold is that a real relationship id and a well-formed span are
  // retained, and that span/text agree with each other and with the
  // proposition's own subject/object spans.
  assert.match(prop.evidence.relationship_id, /^rel-/);
  assert.equal(prop.evidence.span.start, Math.min(prop.subject.span.start, prop.object.span.start));
  assert.equal(prop.evidence.span.end, Math.max(prop.subject.span.end, prop.object.span.end));
  assert.equal(prop.evidence.text, text.slice(prop.evidence.span.start, prop.evidence.span.end));
  assert.equal(prop.source, "SYNTAX_SVO");
});

test("10. Epistemic separation: truth_state, confidence, probability, and uncertainty are independent fields", () => {
  const prop = extract("John works at Google.").propositions[0];
  assert.equal(prop.truth_state, TruthState.UNKNOWN);
  assert.equal(prop.confidence, null);
  assert.equal(prop.probability, ProbabilityStatus.NOT_DEFINED);
  assert.equal(prop.uncertainty, UncertaintyStatus.PRESENT);

  // None of these may be derived from another.
  assert.notEqual(prop.probability, prop.truth_state);
  assert.notEqual(typeof prop.confidence, typeof prop.probability);
});

test("11. Probability remains NOT_DEFINED — never invented merely because a proposition is uncertain", () => {
  const results = ["Dog bites man.", "John works at Google.", "Google works with John."].map(
    (s) => extract(s).propositions[0]
  );
  for (const prop of results) {
    assert.equal(prop.probability, ProbabilityStatus.NOT_DEFINED);
  }
});

test("12. UNKNOWN truth_state is preserved: extraction from text never auto-promotes to VERIFIED", () => {
  const prop = extract("John works at Google.").propositions[0];
  assert.equal(prop.truth_state, TruthState.UNKNOWN);
  assert.notEqual(prop.truth_state, TruthState.VERIFIED);
  assert.notEqual(prop.truth_state, TruthState.KNOWN);
});

test("Temporal information: a resolved DATE entity flows through unchanged, never reinterpreted", () => {
  const result = extract("John works at Google today.", { now: new Date("2026-09-10T12:00:00Z"), timezone: "UTC" });
  assert.equal(result.propositions.length, 2);
  const todayProp = result.propositions.find((p) => p.object.surface.toLowerCase() === "today");
  assert.ok(todayProp);
  assert.equal(todayProp.object.type, EntityType.DATE);
  assert.equal(todayProp.object.attributes.resolved, true);
  assert.ok(todayProp.object.attributes.resolved_date);
});

test("Determinism: identical input yields structurally identical propositions except for generated ids", () => {
  const a = extract("John works at Google in Toronto.").propositions;
  const b = extract("John works at Google in Toronto.").propositions;
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) {
    assert.deepEqual(simplify(a[i]), simplify(b[i]));
    assert.equal(a[i].truth_state, b[i].truth_state);
    assert.equal(a[i].confidence, b[i].confidence);
    assert.equal(a[i].probability, b[i].probability);
    assert.equal(a[i].uncertainty, b[i].uncertainty);
    assert.notEqual(a[i].id, b[i].id);
  }
});
