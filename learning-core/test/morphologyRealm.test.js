"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { MorphFeature, analyzeMorphology, analyzeToken } = require("../language/realm/morphologyRealm");
const { TokenType, createToken } = require("../language/realm/tokenRealm");

test("morphology realm: rejects empty input", () => {
  const result = analyzeMorphology("");
  assert.equal(result.state, 0);
  assert.equal(result.stem, null);
  assert.ok(result.reason);
});

test("morphology realm: rejects non-alphabetic input", () => {
  const result = analyzeMorphology("42");
  assert.equal(result.state, 0);
  assert.ok(result.reason);
});

test("morphology realm: 'dogs' yields plural noun and present-3sg verb candidates sharing one stem", () => {
  const result = analyzeMorphology("dogs");
  assert.equal(result.state, 1);
  assert.equal(result.stem, "dog");
  assert.deepEqual(
    result.candidates.map((c) => c.feature).sort(),
    [MorphFeature.PLURAL, MorphFeature.PRESENT_3SG].sort()
  );
  assert.ok(result.candidates.every((c) => c.stem === "dog"));
});

test("morphology realm: 'boxes' strips the sibilant -es suffix", () => {
  const result = analyzeMorphology("boxes");
  assert.equal(result.stem, "box");
  assert.deepEqual(
    result.candidates.map((c) => c.feature).sort(),
    [MorphFeature.PLURAL, MorphFeature.PRESENT_3SG].sort()
  );
});

test("morphology realm: 'flies' applies the -ies -> y rule", () => {
  const result = analyzeMorphology("flies");
  assert.equal(result.stem, "fly");
  assert.deepEqual(
    result.candidates.map((c) => c.feature).sort(),
    [MorphFeature.PLURAL, MorphFeature.PRESENT_3SG].sort()
  );
});

test("morphology realm: 'walked' yields past-tense and past-participle candidates", () => {
  const result = analyzeMorphology("walked");
  assert.equal(result.stem, "walk");
  assert.deepEqual(
    result.candidates.map((c) => c.feature).sort(),
    [MorphFeature.PAST_TENSE, MorphFeature.PAST_PARTICIPLE].sort()
  );
});

test("morphology realm: 'tried' applies the -ied -> y rule", () => {
  const result = analyzeMorphology("tried");
  assert.equal(result.stem, "try");
});

test("morphology realm: 'chased' restores the dropped silent e (Porter CVC rule)", () => {
  const result = analyzeMorphology("chased");
  assert.equal(result.stem, "chase");
});

test("morphology realm: 'watched' needs no e-restoration and is left alone", () => {
  const result = analyzeMorphology("watched");
  assert.equal(result.stem, "watch");
});

test("morphology realm: 'running' undoubles the final consonant", () => {
  const result = analyzeMorphology("running");
  assert.equal(result.stem, "run");
  assert.deepEqual(
    result.candidates.map((c) => c.feature).sort(),
    [MorphFeature.GERUND, MorphFeature.PROGRESSIVE].sort()
  );
});

test("morphology realm: 'hissing' does NOT undouble a base-word double consonant (s is excluded)", () => {
  const result = analyzeMorphology("hissing");
  assert.equal(result.stem, "hiss");
});

test("morphology realm: 'faster' yields comparative and agentive-noun candidates", () => {
  const result = analyzeMorphology("faster");
  assert.equal(result.stem, "fast");
  assert.deepEqual(
    result.candidates.map((c) => c.feature).sort(),
    [MorphFeature.AGENTIVE_NOUN, MorphFeature.COMPARATIVE].sort()
  );
});

test("morphology realm: 'biggest' undoubles before the superlative suffix", () => {
  const result = analyzeMorphology("biggest");
  assert.equal(result.stem, "big");
  assert.deepEqual(result.candidates.map((c) => c.feature), [MorphFeature.SUPERLATIVE]);
});

test("morphology realm: irregular forms match no rule and are reported as base form, never guessed", () => {
  const result = analyzeMorphology("ran");
  assert.equal(result.state, 1);
  assert.equal(result.stem, "ran");
  assert.deepEqual(result.candidates, []);
  assert.ok(result.reason);
});

test("morphology realm: a word with no inflectional suffix is its own stem", () => {
  const result = analyzeMorphology("dog");
  assert.equal(result.state, 1);
  assert.equal(result.stem, "dog");
  assert.deepEqual(result.candidates, []);
});

test("morphology realm: analyzeToken delegates WORD tokens to analyzeMorphology", () => {
  const token = createToken("Dogs", 0, 4, 0, TokenType.WORD);
  const result = analyzeToken(token);
  assert.equal(result.state, 1);
  assert.equal(result.stem, "dog");
});

test("morphology realm: analyzeToken refuses non-WORD tokens rather than guessing", () => {
  const token = createToken(".", 0, 1, 0, TokenType.PUNCTUATION);
  const result = analyzeToken(token);
  assert.equal(result.state, 0);
  assert.ok(result.reason.includes("PUNCTUATION"));
});

test("morphology realm: analyzeToken rejects a non-token argument", () => {
  const result = analyzeToken(null);
  assert.equal(result.state, 0);
  assert.ok(result.reason);
});
