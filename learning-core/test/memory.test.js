"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const store = require("../memory/store");
const { createMemoryRecord } = require("../memory/types");

beforeEach(() => store._reset());

test("memory: classifies records into the correct memory class", () => {
  const rec = store.remember("PREFERENCE", { type: "preference", content: "prefers concise replies", truthState: "KNOWN" });
  assert.equal(store.recall("PREFERENCE", rec.memory_id).content, "prefers concise replies");
  assert.equal(store.recall("EPISODIC", rec.memory_id), null);
});

test("memory: rejects an unknown memory class", () => {
  assert.throws(() => store.remember("IMAGINARY", { type: "x", content: "y" }), TypeError);
});

test("memory: preserves provenance (source and source_reference)", () => {
  const rec = store.remember("SEMANTIC", {
    type: "fact",
    content: "Industry 4.0 stage: Accelerating",
    source: "uploaded_document",
    sourceReference: "doc-123#p4",
  });
  assert.equal(rec.source, "uploaded_document");
  assert.equal(rec.source_reference, "doc-123#p4");
});

test("memory: defaults truth_state to UNKNOWN, never FALSE", () => {
  const rec = createMemoryRecord({ type: "claim", content: "unverified statement" });
  assert.equal(rec.truth_state, "UNKNOWN");
});

test("memory: rejects an invalid truth_state rather than silently accepting it", () => {
  assert.throws(() => createMemoryRecord({ type: "claim", content: "x", truthState: "DEFINITELY" }), TypeError);
});

test("memory: keeps confidence and truth_state as independent fields", () => {
  const rec = createMemoryRecord({ type: "prediction", content: "traffic will rise", truthState: "HYPOTHESIS", confidence: 0.7 });
  assert.equal(rec.truth_state, "HYPOTHESIS");
  assert.equal(rec.confidence, 0.7);
});

test("memory: supports user_scope for cross-user isolation", () => {
  const rec = store.remember("PROJECT", { type: "note", content: "internal note", userScope: "ashok" });
  assert.equal(rec.user_scope, "ashok");
  const forOtherUser = store.query("PROJECT", (r) => r.user_scope === "someone-else");
  assert.equal(forOtherUser.length, 0);
});
