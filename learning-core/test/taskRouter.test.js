"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { TaskType, routeTask } = require("../model/taskRouter");
const { tokenize } = require("../language/realm/tokenRealm");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");

test("Model router: ARITHMETIC routes to the Mathematical Engine, real computation, never an LLM", async () => {
  const { backend, result } = await routeTask({ taskType: TaskType.ARITHMETIC, args: { operation: "add", params: [2, 2] } });
  assert.equal(backend, "MATHEMATICAL_ENGINE");
  assert.equal(result.output, 4);
});

test("Model router: ARITHMETIC rejects an unknown operation name rather than calling an arbitrary method", async () => {
  await assert.rejects(() => routeTask({ taskType: TaskType.ARITHMETIC, args: { operation: "deleteEverything", params: [] } }), TypeError);
});

test("Model router: DEDUCTIVE_REASONING routes to the Reasoning Realm", async () => {
  const rule = { id: "rule-1", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };
  const records = [{ id: "know-1", subject: { surface: "Penguins" }, predicate: "IS_A", object: { surface: "bird" } }];
  const { backend, result } = await routeTask({ taskType: TaskType.DEDUCTIVE_REASONING, args: { rule, records } });
  assert.equal(backend, "REASONING_REALM");
  assert.equal(result[0].object.surface, "fly");
});

test("Model router: CONSISTENCY_CHECK routes to the Reasoning Realm's checkConsistency", async () => {
  const john = { id: "entity-john", surface: "John" };
  const toronto = { id: "entity-toronto", surface: "Toronto" };
  const records = [
    { id: "know-a", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE" },
    { id: "know-b", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE" },
  ];
  const { backend, result } = await routeTask({ taskType: TaskType.CONSISTENCY_CHECK, args: { records } });
  assert.equal(backend, "REASONING_REALM");
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "POLARITY_CONTRADICTION");
});

test("Model router: ENTITY_EXTRACTION routes to the Entity Realm", async () => {
  const text = "John works at Google.";
  const { tokens } = tokenize(text);
  const { backend, result } = await routeTask({ taskType: TaskType.ENTITY_EXTRACTION, args: { text, tokens } });
  assert.equal(backend, "ENTITY_REALM");
  assert.ok(result.length >= 2);
});

test("Model router: KNOWLEDGE_QUERY routes to the Knowledge Query Realm", async () => {
  const text = "John works at Google.";
  const { tokens } = tokenize(text);
  const records = extractKnowledge(text, tokens).records;
  const { backend, result } = await routeTask({ taskType: TaskType.KNOWLEDGE_QUERY, args: { records, criteria: { predicate: "WORKS_AT" } } });
  assert.equal(backend, "KNOWLEDGE_QUERY_REALM");
  assert.equal(result.length, 1);
});

test("Model router: SURFACE_TEXT_GENERATION routes to the Language Generation Realm", async () => {
  const text = "Dog bites man.";
  const { tokens } = tokenize(text);
  const [record] = extractKnowledge(text, tokens).records;
  const { backend, result } = await routeTask({ taskType: TaskType.SURFACE_TEXT_GENERATION, args: { record } });
  assert.equal(backend, "LANGUAGE_GENERATION_REALM");
  assert.equal(result.text, "Dog bites man.");
});

test("Model router: OPEN_ENDED_GENERATION routes to model/registry.js's LLM provider path, honestly UNKNOWN with no credentials connected", async () => {
  const { backend, result } = await routeTask({ taskType: TaskType.OPEN_ENDED_GENERATION, args: { request: { prompt: "hello" } } });
  assert.equal(backend, "LLM_PROVIDER");
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.output, null);
});

test("Model router: an unrecognized taskType throws rather than silently defaulting to the LLM", async () => {
  await assert.rejects(() => routeTask({ taskType: "SOMETHING_MADE_UP", args: {} }), TypeError);
});
