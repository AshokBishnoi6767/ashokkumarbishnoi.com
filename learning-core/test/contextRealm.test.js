"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildContextFrame, detectUnresolvedReferences } = require("../language/realm/contextRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");
const { extractEntityMentions } = require("../language/realm/entityRealm");
const { TruthState } = require("../shared/constants");

function tokensFor(text) {
  return tokenize(text).tokens;
}

test("Context realm: empty context reports everything unknown, nothing invented", () => {
  const frame = buildContextFrame();
  assert.equal(frame.current_input, null);
  assert.deepEqual(frame.preceding_inputs, []);
  assert.equal(frame.speaker, null);
  assert.equal(frame.time, null);
  assert.deepEqual(frame.known_state, []);
  assert.deepEqual(frame.unknown_state, [
    "session_id",
    "current_input",
    "preceding_inputs",
    "speaker",
    "listener",
    "time",
    "place",
    "task",
    "active_entities",
    "active_propositions",
    "active_knowledge",
  ]);
});

test("Context realm: single current input is known, everything else stays unknown", () => {
  const frame = buildContextFrame({ currentInput: { text: "Dog bites man." } });
  assert.deepEqual(frame.current_input, { text: "Dog bites man." });
  assert.ok(frame.known_state.includes("current_input"));
  assert.ok(!frame.known_state.includes("preceding_inputs"));
});

test("Context realm: multiple preceding inputs are preserved in order, not reordered or deduplicated", () => {
  const preceding = [{ text: "Hi" }, { text: "Hi" }, { text: "How are you?" }];
  const frame = buildContextFrame({ precedingInputs: preceding });
  assert.deepEqual(frame.preceding_inputs, preceding);
  assert.equal(frame.preceding_inputs.length, 3);
  assert.ok(frame.known_state.includes("preceding_inputs"));
});

test("Context realm: multiple active propositions are carried by reference, unchanged", () => {
  const { records: dogRecords } = extractKnowledge("Dog bites man.", tokensFor("Dog bites man."));
  const { records: johnRecords } = extractKnowledge("John works at Google.", tokensFor("John works at Google."));
  const propositions = [...dogRecords, ...johnRecords];

  const frame = buildContextFrame({ activePropositions: propositions });
  assert.equal(frame.active_propositions.length, 2);
  assert.equal(frame.active_propositions[0], dogRecords[0]);
  assert.equal(frame.active_propositions[1], johnRecords[0]);
  assert.ok(frame.known_state.includes("active_propositions"));
});

test("Context realm: multiple active entities are carried by reference, unchanged", () => {
  const text = "John works at Google.";
  const entities = extractEntityMentions(text, tokensFor(text));
  assert.ok(entities.length >= 2);

  const frame = buildContextFrame({ activeEntities: entities });
  assert.deepEqual(frame.active_entities, entities);
  assert.equal(frame.active_entities[0], entities[0]);
  assert.ok(frame.known_state.includes("active_entities"));
});

test("Context realm: explicit speaker is recorded exactly as given, never inferred", () => {
  const speaker = { id: "user-1", name: "Ashok" };
  const frame = buildContextFrame({ speaker });
  assert.deepEqual(frame.speaker, speaker);
  assert.ok(frame.known_state.includes("speaker"));
  assert.equal(frame.listener, null);
  assert.ok(frame.unknown_state.includes("listener"));
});

test("Context realm: explicit time is recorded exactly as given, never computed here", () => {
  const time = { resolved: true, date: "2026-09-10", timezone: "UTC" };
  const frame = buildContextFrame({ time });
  assert.deepEqual(frame.time, time);
  assert.ok(frame.known_state.includes("time"));
});

test("Context realm: a pronoun is flagged as an unresolved reference without inventing a referent", () => {
  const text = "John called him.";
  const frame = buildContextFrame({ currentInput: { text }, tokens: tokensFor(text) });

  assert.equal(frame.unresolved_references.length, 1);
  const ref = frame.unresolved_references[0];
  assert.equal(ref.surface, "him");
  assert.equal(ref.status, "UNRESOLVED");
  assert.ok(ref.candidate_tags.includes("PRON"));
  assert.equal("referent" in ref, false);
});

test("Context realm: detectUnresolvedReferences finds every pronoun in order, not just the first", () => {
  const text = "He told her they were late.";
  const refs = detectUnresolvedReferences(tokensFor(text));
  const surfaces = refs.map((r) => r.surface);
  assert.deepEqual(surfaces, ["He", "her", "they"]);
});

test("Context realm: no tokens supplied yields no unresolved references, never a guess", () => {
  const frame = buildContextFrame({ currentInput: { text: "John called him." } });
  assert.deepEqual(frame.unresolved_references, []);
});

test("Context realm: provenance is always present and identifies this realm", () => {
  const frame = buildContextFrame({ speaker: "Ashok" });
  assert.equal(frame.provenance.realm, "CONTEXT_REPRESENTATION");
  assert.ok(typeof frame.provenance.assembled_at === "string");
  assert.ok(!Number.isNaN(Date.parse(frame.provenance.assembled_at)));
});

test("Context realm: deterministic reconstruction — identical input yields structurally identical frames except timestamp", () => {
  const text = "Dog bites man.";
  const tokens = tokensFor(text);
  const { records } = extractKnowledge(text, tokens);

  const frameA = buildContextFrame({ currentInput: { text }, activePropositions: records, tokens });
  const frameB = buildContextFrame({ currentInput: { text }, activePropositions: records, tokens });

  const strip = (f) => {
    const { provenance, ...rest } = f;
    return rest;
  };
  assert.deepEqual(strip(frameA), strip(frameB));
});

test("Context realm: no accidental truth promotion — active propositions/knowledge keep their own epistemic state, the frame adds none of its own", () => {
  const text = "Dog bites man.";
  const { records } = extractKnowledge(text, tokensFor(text));
  const frame = buildContextFrame({ activePropositions: records, activeKnowledge: records });

  assert.equal(frame.active_propositions[0].truth_state, TruthState.UNKNOWN);
  assert.equal(frame.active_knowledge[0].truth_state, TruthState.UNKNOWN);
  assert.equal("truth_state" in frame, false);
  assert.equal("confidence" in frame, false);
  assert.equal("probability" in frame, false);
  assert.equal("uncertainty" in frame, false);
});

test("Context realm: rejects non-array precedingInputs rather than silently coercing", () => {
  assert.throws(() => buildContextFrame({ precedingInputs: "not an array" }), TypeError);
});

test("Context realm: rejects non-array activeEntities rather than silently coercing", () => {
  assert.throws(() => buildContextFrame({ activeEntities: {} }), TypeError);
});

test("Context realm: rejects non-array tokens rather than silently coercing", () => {
  assert.throws(() => buildContextFrame({ tokens: "not an array" }), TypeError);
});
