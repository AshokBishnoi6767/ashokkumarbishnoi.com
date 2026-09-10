"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { understand, reason, generate, runTrinityPipeline } = require("../core/trinityEngine");
const { TruthState } = require("../shared/constants");

test("Trinity engine: understand() composes tokens, entities, knowledge, and context from raw text alone", () => {
  const u = understand("John works at Google.");
  assert.ok(u.tokens.length > 0);
  assert.ok(u.entities.length >= 2);
  assert.equal(u.knowledge.records.length, 1);
  assert.equal(u.context.current_input.text, "John works at Google.");
  assert.deepEqual(u.context.active_knowledge, u.knowledge.records);
});

test("Trinity engine: understand() is deterministic — identical text yields structurally identical knowledge and entities (ids differ, structure doesn't)", () => {
  const a = understand("Dog bites man.");
  const b = understand("Dog bites man.");
  assert.equal(a.knowledge.records[0].subject.surface, b.knowledge.records[0].subject.surface);
  assert.equal(a.knowledge.records[0].predicate, b.knowledge.records[0].predicate);
  assert.equal(a.entities.length, b.entities.length);
});

test("Trinity engine: word order changes the understood knowledge — 'Man bites dog.' is structurally distinct", () => {
  const forward = understand("Dog bites man.").knowledge.records[0];
  const reverse = understand("Man bites dog.").knowledge.records[0];
  assert.equal(forward.subject.surface, "Dog");
  assert.equal(reverse.subject.surface, "Man");
});

test("Trinity engine: reason() derives new records only from caller-supplied rules, never invents one", () => {
  const u = understand("John works at Google.");
  const rule = { id: "rule-1", if: { predicate: "WORKS_AT", objectSurface: "Google" }, then: { predicate: "HAS_BADGE_ACCESS", objectSurface: "Google campus" } };
  const { derived } = reason(u, { rules: [rule] });
  assert.equal(derived.length, 1);
  assert.equal(derived[0].truth_state, TruthState.DERIVED);
  assert.equal(derived[0].object.surface, "Google campus");
});

test("Trinity engine: reason() with no rules derives nothing", () => {
  const u = understand("John works at Google.");
  const { derived, contradictions } = reason(u, {});
  assert.deepEqual(derived, []);
  assert.deepEqual(contradictions, []);
});

test("Trinity engine: generate() round-trips a knowledge record back to matching surface text via the Model Router", async () => {
  const u = understand("Dog bites man.");
  const { backend, result } = await generate(u.knowledge.records[0]);
  assert.equal(backend, "LANGUAGE_GENERATION_REALM");
  assert.equal(result.text, "Dog bites man.");
});

test("Trinity engine: runTrinityPipeline() runs the full chain end to end with zero LLM/network dependency", async () => {
  const result = await runTrinityPipeline("John works at Google.");
  assert.equal(result.understanding.knowledge.records.length, 1);
  assert.equal(result.generated.length, 1);
  assert.equal(result.generated[0].text, "John works at Google.");
});

test("Trinity engine: runTrinityPipeline() with rules produces both observed and derived generated text", async () => {
  const rule = { id: "rule-1", if: { predicate: "WORKS_AT", objectSurface: "Google" }, then: { predicate: "HAS_BADGE_ACCESS", objectSurface: "Google campus" } };
  const result = await runTrinityPipeline("John works at Google.", { rules: [rule] });
  assert.equal(result.understanding.knowledge.records.length, 1);
  assert.equal(result.reasoning.derived.length, 1);
  assert.equal(result.generated.length, 2);
  assert.ok(result.generated.some((g) => g.text.startsWith("(derived)")));
});

test("Trinity engine: runTrinityPipeline() handles honest 'nothing found' input without throwing", async () => {
  const result = await runTrinityPipeline("The big red ball.");
  assert.deepEqual(result.understanding.knowledge.records, []);
  assert.deepEqual(result.generated, []);
  assert.ok(result.understanding.knowledge.reason);
});

test("Trinity engine: reason() surfaces a real contradiction when a caller-supplied constraint is violated", () => {
  const john = { id: "entity-john", surface: "John" };
  const fakeUnderstanding = {
    knowledge: {
      records: [
        { id: "know-a", subject: john, predicate: "WORKS_AT", object: { id: "entity-google", surface: "Google" } },
        { id: "know-b", subject: john, predicate: "WORKS_AT", object: { id: "entity-microsoft", surface: "Microsoft" } },
      ],
    },
  };
  const { contradictions } = reason(fakeUnderstanding, {
    constraints: [{ predicate: "WORKS_AT", exclusivity: "SINGLE_VALUE" }],
  });
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].type, "CONSTRAINT_CONTRADICTION");
});
