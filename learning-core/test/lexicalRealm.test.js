"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeWord,
  createLexicalEntry,
  createLexicon,
  lookupWord,
} = require("../language/realm/lexicalRealm");

test("lexical realm: normalizes a word", () => {
  assert.equal(normalizeWord("  CAT  "), "cat");
});

test("lexical realm: rejects invalid input", () => {
  assert.equal(normalizeWord(""), null);
  assert.equal(normalizeWord(null), null);
});

test("lexical realm: creates a structured lexical entry", () => {
  const result = createLexicalEntry("Cat", {
    category: "noun",
    meaning: "a feline animal",
  });

  assert.equal(result.state, 1);
  assert.equal(result.word, "cat");
  assert.equal(result.lemma, "cat");
  assert.equal(result.category, "noun");
  assert.equal(result.morphology, "base");
  assert.equal(result.meaning, "a feline animal");
});

test("lexical realm: builds a lexicon", () => {
  const lexicon = createLexicon([
    { word: "cat", category: "noun" },
    { word: "run", category: "verb" },
  ]);

  assert.equal(lexicon.size, 2);
  assert.equal(lexicon.has("cat"), true);
  assert.equal(lexicon.has("run"), true);
});

test("lexical realm: resolves a known word", () => {
  const lexicon = createLexicon([
    { word: "cat", category: "noun" },
  ]);

  const result = lookupWord("CAT", lexicon);

  assert.equal(result.state, 1);
  assert.equal(result.word, "cat");
  assert.equal(result.candidate.category, "noun");
  assert.equal(result.source, "lexicon");
});

test("lexical realm: returns zero for an unknown word", () => {
  const lexicon = createLexicon([
    { word: "cat", category: "noun" },
  ]);

  const result = lookupWord("xyz", lexicon);

  assert.equal(result.state, 0);
  assert.equal(result.candidate, null);
  assert.ok(result.reason);
});
