"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { findNounPhrases, parseSentence } = require("../language/realm/syntaxRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { POSTag } = require("../language/realm/posRealm");

function words(tokens) {
  return tokens.map((t) => t.text);
}

test("Syntax realm: rejects non-array input", () => {
  const result = parseSentence(null);
  assert.equal(result.state, 0);
  assert.ok(result.reason);
});

test("Syntax realm: rejects an empty token array", () => {
  const result = parseSentence([]);
  assert.equal(result.state, 0);
  assert.ok(result.reason);
});

test("NP chunking: 'The fastest cat' resolves DET + ADJ* + NOUN, with 'cat' inferred as head from structure, not POS context", () => {
  const { tokens } = tokenize("The fastest cat runs.");
  const phrases = findNounPhrases(tokens);

  assert.equal(phrases.length, 1);
  assert.deepEqual(words(phrases[0].tokens), ["The", "fastest", "cat"]);
  assert.equal(phrases[0].det.text, "The");
  assert.deepEqual(words(phrases[0].modifiers), ["fastest"]);
  assert.equal(phrases[0].head.text, "cat");
  assert.equal(phrases[0].headInferredFromPosition, true);
});

test("NP chunking: bare NPs with no determiner ('Dog', 'man') are not chunked — DET-triggering only", () => {
  const { tokens } = tokenize("Dog bites man.");
  const phrases = findNounPhrases(tokens);
  assert.deepEqual(phrases, []);
});

test("NP chunking: a token carrying both ADJ and NOUN in the modifier position is treated as the head (conservative, shortest match) rather than assuming the phrase continues", () => {
  const { tokens } = tokenize("The big red ball.");
  const phrases = findNounPhrases(tokens);

  assert.equal(phrases.length, 1);
  assert.deepEqual(words(phrases[0].tokens), ["The", "big"]);
  assert.equal(phrases[0].head.text, "big");
  assert.deepEqual(phrases[0].modifiers, []);
  // "red" and "ball" are not part of any determiner-led chunk at this
  // phase — a documented limitation, not a silent wrong answer.
});

test("NP chunking: no chunk is produced when the DET+ADJ*+NOUN pattern never closes with a head", () => {
  // "under" is closed-class PREP only — neither NOUN, ADJ, nor
  // zero-evidence — so the pattern breaks with concrete contrary
  // evidence right after the determiner and no chunk is formed.
  const { tokens } = tokenize("The under bridge.");
  const phrases = findNounPhrases(tokens);
  assert.deepEqual(phrases, []);
});

test("Clause structure: 'Dog bites man.' -> SUBJECT=Dog, VERB=bites, OBJECT=man", () => {
  const { tokens } = tokenize("Dog bites man.");
  const result = parseSentence(tokens);

  assert.equal(result.clause.state, 1);
  assert.equal(result.clause.subject.head.text, "Dog");
  assert.equal(result.clause.verb.token.text, "bites");
  assert.equal(result.clause.object.head.text, "man");
});

test("Clause structure: 'Man bites dog.' -> SUBJECT=Man, VERB=bites, OBJECT=dog (word order flips the relationship)", () => {
  const { tokens } = tokenize("Man bites dog.");
  const result = parseSentence(tokens);

  assert.equal(result.clause.state, 1);
  assert.equal(result.clause.subject.head.text, "Man");
  assert.equal(result.clause.verb.token.text, "bites");
  assert.equal(result.clause.object.head.text, "dog");
});

test("Clause structure: 'Dog bites man.' and 'Man bites dog.' produce genuinely different structures, not just relabeled tokens", () => {
  const a = parseSentence(tokenize("Dog bites man.").tokens);
  const b = parseSentence(tokenize("Man bites dog.").tokens);

  // Compare normalized forms: "Dog" is sentence-initial (capitalized)
  // in one sentence and sentence-final (lowercase) in the other — same
  // word, different surface casing, which .text alone would obscure.
  assert.notEqual(a.clause.subject.head.normalized, b.clause.subject.head.normalized);
  assert.notEqual(a.clause.object.head.normalized, b.clause.object.head.normalized);
  assert.equal(a.clause.subject.head.normalized, b.clause.object.head.normalized);
  assert.equal(a.clause.object.head.normalized, b.clause.subject.head.normalized);
});

test("Clause structure: 'The fastest cat runs.' resolves the subject NP through syntax and leaves no object (intransitive)", () => {
  const { tokens } = tokenize("The fastest cat runs.");
  const result = parseSentence(tokens);

  assert.equal(result.clause.state, 1);
  assert.deepEqual(words(result.clause.subject.tokens), ["The", "fastest", "cat"]);
  assert.equal(result.clause.subject.head.text, "cat");
  assert.ok(result.clause.subject.nounPhrase);
  assert.equal(result.clause.verb.token.text, "runs");
  assert.equal(result.clause.object, null);
});

test("Clause structure: zero verb candidates is reported unresolved, never guessed", () => {
  const { tokens } = tokenize("The big red ball.");
  const result = parseSentence(tokens);

  assert.equal(result.clause.state, 0);
  assert.equal(result.clause.ambiguous, false);
  assert.deepEqual(result.clause.verbCandidates, []);
  assert.ok(result.clause.reason);
});

test("Clause structure: multiple verb-candidate tokens is reported as ambiguous, never a forced pick", () => {
  const { tokens } = tokenize("Dogs cats chase.");
  const result = parseSentence(tokens);

  assert.equal(result.clause.state, 0);
  assert.equal(result.clause.ambiguous, true);
  assert.deepEqual(words(result.clause.verbCandidates), ["Dogs", "cats"]);
  assert.ok(result.clause.reason);
});

test("Clause structure: a multi-token subject/object span that is not a recognized NP has head=null, never guessed", () => {
  // "red ball" has no leading determiner, so it cannot match the
  // DET+ADJ*+NOUN pattern as a span — head must stay unresolved.
  const { tokens } = tokenize("Boy throws red ball.");
  const result = parseSentence(tokens);

  assert.equal(result.clause.state, 1);
  assert.equal(result.clause.verb.token.text, "throws");
  assert.deepEqual(words(result.clause.object.tokens), ["red", "ball"]);
  assert.equal(result.clause.object.head, null);
  assert.ok(result.clause.object.reason);
});

test("Clause structure: copula fallback — 'John is in Toronto.' has no VERB-candidate token, so the unambiguous AUX 'is' anchors the clause as pivot", () => {
  const { tokens } = tokenize("John is in Toronto.");
  const result = parseSentence(tokens);

  assert.equal(result.clause.state, 1);
  assert.equal(result.clause.verb.token.text, "is");
  assert.equal(result.clause.verb.pivotType, "COPULA_AUX");
  assert.equal(result.clause.verb.candidates.some((c) => c.tag === POSTag.AUX), true);
});

test("Clause structure: a real VERB pivot always wins over the copula fallback — pivotType is 'VERB', not 'COPULA_AUX'", () => {
  const { tokens } = tokenize("Dog bites man.");
  const result = parseSentence(tokens);
  assert.equal(result.clause.verb.pivotType, "VERB");
});

test("Clause structure: two or more unambiguous AUX tokens with no VERB candidate is reported ambiguous, never a forced copula pick", () => {
  // "should" and "must" are both single-tag CLOSED_CLASS AUX entries
  // (unlike "can"/"will"/"may", which stay ambiguous with NOUN), and
  // neither sentence has any other VERB-candidate token.
  const { tokens } = tokenize("John should must.");
  const result = parseSentence(tokens);
  assert.equal(result.clause.state, 0);
  assert.equal(result.clause.ambiguous, true);
  assert.ok(result.clause.reason);
});

test("Clause structure: an imperative sentence with no subject span reports subject=null rather than forcing one", () => {
  const { tokens } = tokenize("Run fast.");
  const result = parseSentence(tokens);

  // Whatever the pivot resolves to, a zero-length span before it must
  // never be forced into a fabricated subject.
  if (result.clause.state === 1) {
    assert.equal(result.clause.subject, null);
  } else {
    assert.ok(result.clause.reason);
  }
});
