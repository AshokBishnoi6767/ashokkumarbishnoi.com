"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { generateSurfaceText, generateMathExpression } = require("../language/realm/generationRealm");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { applyRule } = require("../language/realm/reasoningRealm");
const math = require("../math/engine");
const { TruthState } = require("../shared/constants");

function recordFor(text) {
  const { tokens } = tokenize(text);
  return extractKnowledge(text, tokens).records[0];
}

test("Generation realm: round-trips a parsed sentence back to matching surface text", () => {
  const record = recordFor("Dog bites man.");
  const generated = generateSurfaceText(record);
  assert.equal(generated.text, "Dog bites man.");
  assert.equal(generated.message_structure, "DECLARATIVE");
  assert.equal(generated.lexical_selection, "LEXICON");
});

test("Generation realm: word order changes the generated sentence too — 'Man bites dog.' stays distinct", () => {
  const forward = generateSurfaceText(recordFor("Dog bites man.")).text;
  const reverse = generateSurfaceText(recordFor("Man bites dog.")).text;
  assert.notEqual(forward, reverse);
  assert.equal(reverse, "Man bites dog.");
});

test("Generation realm: a known predicate lexicon entry renders naturally (WORKS_AT -> 'works at')", () => {
  const generated = generateSurfaceText(recordFor("John works at Google."));
  assert.equal(generated.text, "John works at Google.");
});

test("Generation realm: an unmapped predicate falls back to mechanical detokenization, marked FALLBACK", () => {
  const record = { subject: { surface: "X" }, predicate: "SOME_UNUSUAL_PREDICATE", object: { surface: "Y" } };
  const generated = generateSurfaceText(record);
  assert.equal(generated.text, "X some unusual predicate Y.");
  assert.equal(generated.lexical_selection, "FALLBACK");
});

test("Generation realm: never adds an unsupported fact — output contains only subject/predicate/object surfaces from the input", () => {
  const record = { subject: { surface: "Alice" }, predicate: "IS_A", object: { surface: "scientist" } };
  const generated = generateSurfaceText(record);
  assert.ok(generated.text.includes("Alice"));
  assert.ok(generated.text.includes("scientist"));
  assert.equal(generated.text, "Alice is a scientist.");
});

test("Generation realm: a DERIVED record renders with a visible (derived) marker — generated text preserves the source epistemic state", () => {
  const penguin = { id: "entity-penguin", surface: "Penguins" };
  const premise = { id: "know-1", subject: penguin, predicate: "IS_A", object: { surface: "bird" }, truth_state: TruthState.UNKNOWN };
  const rule = { id: "rule-1", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };
  const [derived] = applyRule(rule, [premise]);

  const generated = generateSurfaceText(derived);
  assert.equal(generated.text, "(derived) Penguins can fly.");
  assert.equal(generated.preserves_truth_state, TruthState.DERIVED);
});

test("Generation realm: an observed (non-derived) record has no (derived) marker", () => {
  const generated = generateSurfaceText(recordFor("Dog bites man."));
  assert.ok(!generated.text.startsWith("(derived)"));
});

test("Generation realm: rejects a record missing subject/predicate/object", () => {
  assert.throws(() => generateSurfaceText({}), TypeError);
  assert.throws(() => generateSurfaceText(null), TypeError);
});

test("Generation realm: generateMathExpression renders a valid arithmetic result", () => {
  const r = generateMathExpression(math.add(2, 2));
  assert.equal(r.text, "2 + 2 = 4");
  assert.equal(r.valid, true);
});

test("Generation realm: generateMathExpression never fabricates a value for an invalid result", () => {
  const r = generateMathExpression(math.divide(5, 0));
  assert.equal(r.valid, false);
  assert.match(r.text, /undefined/);
  assert.match(r.text, /Division by zero/);
});

test("Generation realm: generateMathExpression handles a non-binary operator (e.g. determinant) via structured fallback", () => {
  const r = generateMathExpression(math.determinant([[1, 2], [3, 4]]));
  assert.equal(r.valid, true);
  assert.match(r.text, /DETERMINANT/);
});

test("Generation realm: rejects a non-math-result input", () => {
  assert.throws(() => generateMathExpression({}), TypeError);
  assert.throws(() => generateMathExpression(null), TypeError);
});
