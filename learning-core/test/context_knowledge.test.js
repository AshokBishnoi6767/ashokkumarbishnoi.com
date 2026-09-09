"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { assembleContext } = require("../context/engine");
const knowledge = require("../knowledge/graph");

beforeEach(() => knowledge._reset());

test("context: records which sources were actually used, not just what was available", () => {
  const ctx = assembleContext({ input: "hello", relevantMemories: [{ memory_id: "m1" }] });
  assert.deepEqual(ctx.sources_used, ["current_input", "relevant_memories"]);
  assert.equal(ctx.recent_conversation.length, 0);
});

test("context: an empty call produces an empty, still-traceable context", () => {
  const ctx = assembleContext();
  assert.deepEqual(ctx.sources_used, []);
  assert.equal(ctx.current_input, null);
});

test("knowledge: asserts and queries relationships as triples with provenance", () => {
  knowledge.assertRelationship("ashok", "works_on", "learning-core", { source: "conversation" });
  const results = knowledge.queryRelationships({ subject: "ashok", predicate: "works_on" });
  assert.equal(results.length, 1);
  assert.equal(results[0].object, "learning-core");
  assert.equal(results[0].source, "conversation");
});

test("knowledge: query with no matches returns an empty array, not null/undefined", () => {
  const results = knowledge.queryRelationships({ subject: "nobody" });
  assert.deepEqual(results, []);
});
