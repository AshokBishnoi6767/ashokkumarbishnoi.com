"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const store = require("../memory/store");
const { storeKnowledgeAsMemory, storeHypothesisAsMemory, storeVerificationAsMemory } = require("../memory/realmBridge");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { proposeHypothesis } = require("../language/realm/hypothesisRealm");
const { verifyClaim } = require("../language/realm/verificationRealm");
const { MemoryClass, TruthState } = require("../shared/constants");

beforeEach(() => store._reset());

function knowledgeRecordFor(text) {
  const { tokens } = tokenize(text);
  return extractKnowledge(text, tokens).records[0];
}

test("Memory bridge: stores a KnowledgeRecord into the existing Memory Engine, content preserved whole", () => {
  const record = knowledgeRecordFor("Dog bites man.");
  const memory = storeKnowledgeAsMemory(record);
  assert.equal(memory.type, "knowledge_record");
  assert.deepEqual(memory.content, record);
  assert.equal(memory.source_reference, record.id);
  assert.equal(memory.truth_state, record.truth_state);

  const recalled = store.recall(MemoryClass.SEMANTIC, memory.memory_id);
  assert.deepEqual(recalled.content, record);
});

test("Memory bridge: preserves related entity ids via the existing related_entities field", () => {
  const record = knowledgeRecordFor("Dog bites man.");
  const memory = storeKnowledgeAsMemory(record);
  assert.deepEqual(memory.related_entities, [record.subject.id, record.object.id]);
});

test("Memory bridge: caller can choose a different MemoryClass (e.g. WORKING for turn-scoped facts)", () => {
  const record = knowledgeRecordFor("Dog bites man.");
  const memory = storeKnowledgeAsMemory(record, { memoryClass: MemoryClass.WORKING });
  assert.equal(store.recall(MemoryClass.SEMANTIC, memory.memory_id), null);
  assert.deepEqual(store.recall(MemoryClass.WORKING, memory.memory_id).content, record);
});

test("Memory bridge: rejects a non-KnowledgeRecord input", () => {
  assert.throws(() => storeKnowledgeAsMemory({}), TypeError);
  assert.throws(() => storeKnowledgeAsMemory(null), TypeError);
});

test("Memory bridge: stores a Hypothesis with truth_state HYPOTHESIS, never guessed toward VERIFIED", () => {
  const h = proposeHypothesis({ proposition: { id: "prop-1" }, supportingEvidence: ["e1"] });
  const memory = storeHypothesisAsMemory(h);
  assert.equal(memory.type, "hypothesis");
  assert.equal(memory.truth_state, TruthState.HYPOTHESIS);
  assert.deepEqual(memory.content, h);
});

test("Memory bridge: stores a Verification result as PROVENANCE, mapping VERIFIED/CONTRADICTED honestly", () => {
  const verified = verifyClaim({ id: "claim-1" }, { independentChecks: [{ name: "x", check: () => true }] });
  const memVerified = storeVerificationAsMemory(verified);
  assert.equal(memVerified.truth_state, TruthState.VERIFIED);

  const contradicted = verifyClaim({ id: "claim-2" }, { independentChecks: [{ name: "x", check: () => false }] });
  const memContradicted = storeVerificationAsMemory(contradicted);
  assert.equal(memContradicted.truth_state, TruthState.FAILED);

  const unknown = verifyClaim({ id: "claim-3" });
  const memUnknown = storeVerificationAsMemory(unknown);
  assert.equal(memUnknown.truth_state, TruthState.UNKNOWN);
});

test("Memory bridge: verification memories land in PROVENANCE, a history-of-checks record, not a restated claim", () => {
  const verified = verifyClaim({ id: "claim-1" }, { independentChecks: [{ name: "x", check: () => true }] });
  const memory = storeVerificationAsMemory(verified);
  assert.deepEqual(store.recall(MemoryClass.PROVENANCE, memory.memory_id).content, verified);
});

test("Memory bridge: does not modify the pre-existing memory/store.js or memory/types.js contract — remember() behaves exactly as before for a plain call", () => {
  const rec = store.remember("PREFERENCE", { type: "preference", content: "prefers concise replies", truthState: "KNOWN" });
  assert.equal(rec.content, "prefers concise replies");
});
