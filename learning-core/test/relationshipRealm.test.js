"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { extractRelationships } = require("../language/realm/relationshipRealm");
const { EntityType } = require("../language/realm/entityRealm");
const { tokenize } = require("../language/realm/tokenRealm");

function extract(text, opts) {
  const { tokens } = tokenize(text);
  return extractRelationships(text, tokens, opts);
}

function simplify(rel) {
  return { subject: rel.subject.surface, predicate: rel.predicate, object: rel.object.surface };
}

test("Relationship realm: rejects invalid input", () => {
  const result = extractRelationships(null, null);
  assert.equal(result.state, 0);
  assert.ok(result.reason);
});

test("1. 'Dog bites man.' -> Dog --BITES--> man, referencing entity-mention-shaped objects with ids", () => {
  const result = extract("Dog bites man.");
  assert.equal(result.state, 1);
  assert.equal(result.relationships.length, 1);
  assert.deepEqual(simplify(result.relationships[0]), { subject: "Dog", predicate: "BITES", object: "man" });

  const rel = result.relationships[0];
  assert.ok(rel.subject.id);
  assert.ok(rel.object.id);
  assert.notEqual(rel.subject.id, rel.object.id);
  // "Dog"/"man" are common nouns the Entity realm correctly does not
  // tag as named entities — they are still valid relationship
  // arguments, wrapped as syntactic-head referents, never bare strings.
  assert.equal(rel.subject.type, EntityType.UNKNOWN);
  assert.equal(rel.subject.source, "SYNTAX_HEAD");
});

test("2. 'Man bites dog.' -> Man --BITES--> dog (word order flips subject/object, same predicate)", () => {
  const result = extract("Man bites dog.");
  assert.equal(result.relationships.length, 1);
  assert.deepEqual(simplify(result.relationships[0]), { subject: "Man", predicate: "BITES", object: "dog" });
});

test("Directionality: 'Dog bites man.' and 'Man bites dog.' are genuinely different relationships, not equivalent", () => {
  const a = extract("Dog bites man.").relationships[0];
  const b = extract("Man bites dog.").relationships[0];
  assert.notEqual(simplify(a).subject, simplify(b).subject);
  assert.notEqual(simplify(a).object, simplify(b).object);
  assert.equal(simplify(a).subject.toLowerCase(), simplify(b).object.toLowerCase());
  assert.equal(simplify(a).object.toLowerCase(), simplify(b).subject.toLowerCase());
});

test("3. 'John works at Google.' -> John --WORKS_AT--> Google, subject/object reference real PERSON/ORGANIZATION entity mentions", () => {
  const result = extract("John works at Google.");
  assert.equal(result.relationships.length, 1);
  const rel = result.relationships[0];
  assert.deepEqual(simplify(rel), { subject: "John", predicate: "WORKS_AT", object: "Google" });
  assert.equal(rel.subject.type, EntityType.PERSON);
  assert.equal(rel.object.type, EntityType.ORGANIZATION);
  assert.equal(rel.attributes.verb, "works");
  assert.equal(rel.attributes.preposition, "at");
});

test("4. 'Google works with John.' -> Google --WORKS_WITH--> John (direction matters: subject/object swap from test 3)", () => {
  const result = extract("Google works with John.");
  assert.equal(result.relationships.length, 1);
  const rel = result.relationships[0];
  assert.deepEqual(simplify(rel), { subject: "Google", predicate: "WORKS_WITH", object: "John" });
  assert.equal(rel.subject.type, EntityType.ORGANIZATION);
  assert.equal(rel.object.type, EntityType.PERSON);
});

test("Directionality: A--REL-->B is not equivalent to B--REL-->A (test 3 vs test 4)", () => {
  const johnWorksAtGoogle = extract("John works at Google.").relationships[0];
  const googleWorksWithJohn = extract("Google works with John.").relationships[0];
  assert.notEqual(johnWorksAtGoogle.predicate, googleWorksWithJohn.predicate);
  assert.equal(johnWorksAtGoogle.subject.type, googleWorksWithJohn.object.type);
  assert.equal(johnWorksAtGoogle.object.type, googleWorksWithJohn.subject.type);
});

test("5. 'John works at Google in Toronto.' -> two relationships sharing subject/verb, correct entity spans preserved", () => {
  const { tokens } = tokenize("John works at Google in Toronto.");
  const result = extractRelationships("John works at Google in Toronto.", tokens);
  assert.equal(result.relationships.length, 2);

  const [atGoogle, inToronto] = result.relationships;
  assert.deepEqual(simplify(atGoogle), { subject: "John", predicate: "WORKS_AT", object: "Google" });
  assert.deepEqual(simplify(inToronto), { subject: "John", predicate: "WORKS_IN", object: "Toronto" });

  // Entity spans preserved: John=[0,1), Google=[3,4), Toronto=[5,6).
  assert.equal(atGoogle.subject.span.tokenStart, 0);
  assert.equal(atGoogle.subject.span.tokenEnd, 1);
  assert.equal(atGoogle.object.span.tokenStart, 3);
  assert.equal(atGoogle.object.span.tokenEnd, 4);
  assert.equal(inToronto.object.type, EntityType.LOCATION);
  assert.equal(inToronto.object.span.tokenStart, 5);
  assert.equal(inToronto.object.span.tokenEnd, 6);

  // Both relationships reference the SAME subject entity mention id —
  // one subject, two predicates, not two disconnected subjects.
  assert.equal(atGoogle.subject.id, inToronto.subject.id);
});

test("6. Two relationships from one clause is supported by chunking the object span into repeated [PREP, entity] pairs", () => {
  const result = extract("John works at Google in Toronto.");
  assert.equal(result.relationships.length, 2);
  assert.notEqual(result.relationships[0].id, result.relationships[1].id);
});

test("7. A sentence with no verb produces zero relationships, never manufactured from co-occurring entities", () => {
  const result = extract("John and Google.");
  assert.equal(result.state, 1);
  assert.deepEqual(result.relationships, []);
  assert.ok(result.reason);
});

test("8. A sentence with multiple possible verb pivots is reported ambiguous, never forced into a relationship", () => {
  const result = extract("Dogs cats chase.");
  assert.equal(result.state, 1);
  assert.deepEqual(result.relationships, []);
  assert.equal(result.ambiguous, true);
  assert.ok(result.reason);
});

test("9. Entities occurring together are NOT related without clause structure connecting them", () => {
  // "John" and "Google" both appear, but there is no verb at all, so no
  // relationship may be manufactured merely from co-occurrence.
  const result = extract("John and Google.");
  assert.deepEqual(result.relationships, []);
});

test("A multi-token object span with no leading preposition, no entity match, and no single-token remainder is left unresolved, not guessed", () => {
  const result = extract("Boy throws red ball.");
  assert.equal(result.state, 1);
  assert.deepEqual(result.relationships, []);
  assert.equal(result.unresolved.length, 1);
  assert.ok(result.unresolved[0].reason);
});

test("An intransitive clause (no object span) reports zero relationships, not a fabricated one", () => {
  const result = extract("The fastest cat runs.");
  assert.equal(result.state, 1);
  assert.deepEqual(result.relationships, []);
  assert.ok(result.reason);
});

test("Relationship id is independent of either argument's id", () => {
  const result = extract("Dog bites man.");
  const rel = result.relationships[0];
  assert.notEqual(rel.id, rel.subject.id);
  assert.notEqual(rel.id, rel.object.id);
});
