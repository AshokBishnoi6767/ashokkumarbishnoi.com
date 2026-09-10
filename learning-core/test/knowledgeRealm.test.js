"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildKnowledgeRecords, extractKnowledge } = require("../language/realm/knowledgeRealm");
const { extractPropositions } = require("../language/realm/semanticRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { TruthState, ProbabilityStatus, UncertaintyStatus } = require("../shared/constants");

function extract(text, opts) {
  const { tokens } = tokenize(text);
  return extractKnowledge(text, tokens, opts);
}

function propositionsFor(text, opts) {
  const { tokens } = tokenize(text);
  return extractPropositions(text, tokens, opts).propositions;
}

function simplify(rec) {
  return { subject: rec.subject.surface, predicate: rec.predicate, object: rec.object.surface };
}

test("Knowledge realm: rejects a non-array propositions input", () => {
  assert.throws(() => buildKnowledgeRecords(null), TypeError);
  assert.throws(() => buildKnowledgeRecords("not an array"), TypeError);
});

test("Knowledge realm: rejects a malformed proposition (no id)", () => {
  assert.throws(() => buildKnowledgeRecords([{ subject: {}, predicate: "X", object: {} }]), TypeError);
});

test("extractKnowledge: rejects invalid input the same way upstream realms do", () => {
  const result = extractKnowledge(null, null);
  assert.equal(result.state, 0);
  assert.ok(result.reason);
  assert.deepEqual(result.records, []);
});

test("1/2. 'Dog bites man.' and 'Man bites dog.' remain different directional knowledge records", () => {
  const dogBitesMan = extract("Dog bites man.").records[0];
  const manBitesDog = extract("Man bites dog.").records[0];
  assert.deepEqual(simplify(dogBitesMan), { subject: "Dog", predicate: "BITES", object: "man" });
  assert.deepEqual(simplify(manBitesDog), { subject: "Man", predicate: "BITES", object: "dog" });
  assert.notEqual(dogBitesMan.id, manBitesDog.id);
  assert.equal(simplify(dogBitesMan).subject.toLowerCase(), simplify(manBitesDog).object.toLowerCase());
  assert.equal(simplify(dogBitesMan).object.toLowerCase(), simplify(manBitesDog).subject.toLowerCase());
});

test("3/4. 'John works at Google.' and 'Google works with John.' remain distinct predicates/relationships", () => {
  const johnWorksAtGoogle = extract("John works at Google.").records[0];
  const googleWorksWithJohn = extract("Google works with John.").records[0];
  assert.deepEqual(simplify(johnWorksAtGoogle), { subject: "John", predicate: "WORKS_AT", object: "Google" });
  assert.deepEqual(simplify(googleWorksWithJohn), { subject: "Google", predicate: "WORKS_WITH", object: "John" });
  assert.notEqual(johnWorksAtGoogle.predicate, googleWorksWithJohn.predicate);
});

test("5. Multiple propositions from the same input remain individually addressable knowledge records", () => {
  const result = extract("John works at Google in Toronto.");
  assert.equal(result.records.length, 2);
  const [atGoogle, inToronto] = result.records;
  assert.deepEqual(simplify(atGoogle), { subject: "John", predicate: "WORKS_AT", object: "Google" });
  assert.deepEqual(simplify(inToronto), { subject: "John", predicate: "WORKS_IN", object: "Toronto" });
  assert.notEqual(atGoogle.id, inToronto.id);
  assert.notEqual(atGoogle.proposition_id, inToronto.proposition_id);
});

test("6. Evidence remains traceable back to the originating proposition/relationship/source span", () => {
  const text = "John works at Google.";
  const props = propositionsFor(text);
  const [record] = buildKnowledgeRecords(props);
  const prop = props[0];

  assert.equal(record.proposition_id, prop.id);
  assert.equal(record.evidence, prop.evidence); // same object, not a copy/summary
  assert.match(record.evidence.relationship_id, /^rel-/);
  assert.equal(record.evidence.text, text.slice(record.evidence.span.start, record.evidence.span.end));
  assert.equal(record.provenance.proposition_source, prop.source);
  assert.equal(record.provenance.realm, "SEMANTIC_REPRESENTATION");
});

test("7. truth_state remains independent from confidence", () => {
  const record = extract("John works at Google.").records[0];
  assert.equal(record.truth_state, TruthState.UNKNOWN);
  assert.equal(record.confidence, null);
  assert.notEqual(record.truth_state, TruthState.VERIFIED);
  assert.notEqual(record.truth_state, TruthState.KNOWN);
});

test("8. probability remains NOT_DEFINED unless already mathematically/statistically justified", () => {
  const records = ["Dog bites man.", "John works at Google.", "Google works with John."].map(
    (s) => extract(s).records[0]
  );
  for (const record of records) {
    assert.equal(record.probability, ProbabilityStatus.NOT_DEFINED);
  }
});

test("9. uncertainty remains independent (not derived from confidence or probability)", () => {
  const record = extract("John works at Google.").records[0];
  assert.equal(record.uncertainty, UncertaintyStatus.PRESENT);
  assert.notEqual(record.uncertainty, record.confidence);
  assert.notEqual(record.uncertainty, record.probability);
});

test("10. Identical propositions are not silently merged: this realm defines no equivalence rule", () => {
  const propA = propositionsFor("Dog bites man.")[0];
  const propB = propositionsFor("Dog bites man.")[0];
  const [recordA, recordB] = buildKnowledgeRecords([propA, propB]);
  assert.equal(recordA.predicate, recordB.predicate);
  assert.equal(recordA.subject.surface, recordB.subject.surface);
  assert.notEqual(recordA.id, recordB.id); // two records, never collapsed into one
  assert.notEqual(recordA.proposition_id, recordB.proposition_id);
});

test("11. Contradictory propositions coexist as separate records; neither is deleted, overwritten, or marked true/false", () => {
  const claim = propositionsFor("John works at Google.")[0];
  const contradiction = propositionsFor("Google works with John.")[0]; // different claim, not literally negation, but a distinct assertion involving the same entities
  const [recordA, recordB] = buildKnowledgeRecords([claim, contradiction]);
  assert.notEqual(recordA.id, recordB.id);
  assert.equal(recordA.truth_state, TruthState.UNKNOWN);
  assert.equal(recordB.truth_state, TruthState.UNKNOWN);
  // Neither record's truth_state was adjusted because of the other's existence.
});

test("Entity identity, subject/object references, and proposition identity are preserved as linked objects, not strings", () => {
  const props = propositionsFor("John works at Google.");
  const [record] = buildKnowledgeRecords(props);
  assert.equal(record.subject, props[0].subject); // same object reference
  assert.equal(record.object, props[0].object);
  assert.ok(record.subject.id);
  assert.ok(record.object.id);
  assert.equal(record.proposition_id, props[0].id);
});

test("Determinism: identical input yields structurally identical knowledge records except for generated ids", () => {
  const a = extract("John works at Google in Toronto.").records;
  const b = extract("John works at Google in Toronto.").records;
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) {
    assert.deepEqual(simplify(a[i]), simplify(b[i]));
    assert.equal(a[i].truth_state, b[i].truth_state);
    assert.equal(a[i].confidence, b[i].confidence);
    assert.equal(a[i].probability, b[i].probability);
    assert.equal(a[i].uncertainty, b[i].uncertainty);
    assert.notEqual(a[i].id, b[i].id);
    assert.notEqual(a[i].proposition_id, b[i].proposition_id);
  }
});

test("Never manufactured: honest upstream failures (no verb, intransitive, ambiguous) propagate to zero knowledge records", () => {
  for (const text of ["John and Google.", "The fastest cat runs.", "The big red ball.", "Dogs cats chase."]) {
    const result = extract(text);
    assert.deepEqual(result.records, []);
    assert.ok(result.reason);
  }
});
