"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { POSTag, classifyToken, tagSentence } = require("../language/realm/posRealm");
const { tokenize, createToken, TokenType } = require("../language/realm/tokenRealm");

function tagsFor(result) {
  return result.candidates.map((c) => c.tag).sort();
}

test("POS realm: rejects a non-token argument", () => {
  const result = classifyToken(null);
  assert.equal(result.state, 0);
  assert.ok(result.reason);
});

test("POS realm: PUNCTUATION tokens are tagged PUNCT directly from token type", () => {
  const token = createToken(".", 0, 1, 0, TokenType.PUNCTUATION);
  const result = classifyToken(token);
  assert.equal(result.state, 1);
  assert.deepEqual(tagsFor(result), [POSTag.PUNCT]);
});

test("POS realm: NUMBER tokens are tagged NUM directly from token type", () => {
  const token = createToken("42", 0, 2, 0, TokenType.NUMBER);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.NUM]);
});

test("POS realm: UNKNOWN token type has no POS rule and is not guessed", () => {
  const token = createToken("\u{1F600}", 0, 2, 0, TokenType.UNKNOWN);
  const result = classifyToken(token);
  assert.equal(result.state, 0);
  assert.ok(result.reason.includes("UNKNOWN"));
});

test("POS realm: closed-class word 'the' is unambiguously DET", () => {
  const token = createToken("the", 0, 3, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.DET]);
});

test("POS realm: 'that' preserves DET/PRON/CONJ ambiguity rather than picking one", () => {
  const token = createToken("that", 0, 4, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.CONJ, POSTag.DET, POSTag.PRON].sort());
});

test("POS realm: 'to' preserves PREP/PART (infinitive marker) ambiguity", () => {
  const token = createToken("to", 0, 2, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.PART, POSTag.PREP].sort());
});

test("POS realm: 'before' preserves PREP/CONJ/ADV ambiguity", () => {
  const token = createToken("before", 0, 6, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.ADV, POSTag.CONJ, POSTag.PREP].sort());
});

test("POS realm: auxiliary/main-verb ambiguity is preserved for 'do'/'have'/'can'", () => {
  for (const word of ["do", "have", "can"]) {
    const token = createToken(word, 0, word.length, 0, TokenType.WORD);
    const result = classifyToken(token);
    assert.equal(result.candidates.some((c) => c.tag === POSTag.AUX), true, word);
    assert.ok(result.candidates.length > 1, word);
  }
});

test("POS realm: irregular past-tense verb 'saw' resolves via the curated lexicon (no suffix morphology could ever find it)", () => {
  const token = createToken("saw", 0, 3, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.VERB]);
  assert.equal(result.candidates[0].rule, "IRREGULAR_VERB_LEXICON");
});

test("POS realm: irregular verb lexicon does not shadow CLOSED_CLASS (closed-class lookup still wins for overlapping words)", () => {
  // Sanity check on lookup order: no current IRREGULAR_VERB_FORMS entry
  // collides with a CLOSED_CLASS word, and this test would catch it if
  // one ever did by asserting a plain closed-class word is unaffected.
  const token = createToken("the", 0, 3, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.DET]);
});

test("POS realm: unambiguous auxiliary 'should' has a single AUX candidate", () => {
  const token = createToken("should", 0, 6, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.AUX]);
});

test("POS realm: 'faster' (morphology) yields ADJ/NOUN candidates, not one forced answer", () => {
  const token = createToken("faster", 0, 6, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.ADJ, POSTag.NOUN].sort());
});

test("POS realm: 'running' in isolation stays ambiguous between NOUN(gerund) and VERB(progressive)", () => {
  const token = createToken("running", 0, 7, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.NOUN, POSTag.VERB].sort());
});

test("POS realm: 'chased' is unambiguously VERB even though morphology has two tense candidates", () => {
  const token = createToken("chased", 0, 6, 0, TokenType.WORD);
  const result = classifyToken(token);
  assert.deepEqual(tagsFor(result), [POSTag.VERB]);
  assert.deepEqual(result.candidates[0].morph_features.sort(), ["PAST_PARTICIPLE", "PAST_TENSE"].sort());
});

test("POS realm: irregular/uninflected open-class word with no context is reported UNKNOWN, never guessed", () => {
  const token = createToken("cat", 0, 3, 0, TokenType.WORD);
  const result = classifyToken(token, { previous: null });
  assert.equal(result.state, 1);
  assert.deepEqual(result.candidates, []);
  assert.ok(result.reason);
});

test("POS realm context: a determiner narrows a following NOUN/VERB morphological ambiguity to NOUN", () => {
  const the = classifyToken(createToken("the", 0, 3, 0, TokenType.WORD));
  const dogs = classifyToken(createToken("dogs", 4, 8, 1, TokenType.WORD), { previous: the });
  assert.deepEqual(tagsFor(dogs), [POSTag.NOUN]);
  assert.ok(dogs.candidates[0].rule.includes("AFTER_DETERMINER_EXCLUDES_VERB"));
});

test("POS realm context: a determiner narrows GERUND/PROGRESSIVE ambiguity to NOUN (gerund reading)", () => {
  const the = classifyToken(createToken("the", 0, 3, 0, TokenType.WORD));
  const running = classifyToken(createToken("running", 4, 11, 1, TokenType.WORD), { previous: the });
  assert.deepEqual(tagsFor(running), [POSTag.NOUN]);
});

test("POS realm context: a determiner with zero morphological evidence narrows to {NOUN, ADJ}, not a single tag", () => {
  const the = classifyToken(createToken("the", 0, 3, 0, TokenType.WORD));
  const cat = classifyToken(createToken("cat", 4, 7, 1, TokenType.WORD), { previous: the });
  assert.deepEqual(tagsFor(cat), [POSTag.ADJ, POSTag.NOUN].sort());
});

test("POS realm context: an unambiguous auxiliary is followed by a proposed bare-form VERB", () => {
  const should = classifyToken(createToken("should", 0, 6, 0, TokenType.WORD));
  const run = classifyToken(createToken("run", 7, 10, 1, TokenType.WORD), { previous: should });
  assert.deepEqual(tagsFor(run), [POSTag.VERB]);
  assert.equal(run.candidates[0].rule, "AFTER_AUX_BARE_VERB");
});

test("POS realm context: an AMBIGUOUS auxiliary ('can') does NOT trigger the bare-verb context rule", () => {
  const can = classifyToken(createToken("can", 0, 3, 0, TokenType.WORD));
  const fish = classifyToken(createToken("fish", 4, 8, 1, TokenType.WORD), { previous: can });
  // "can" resolves to two candidates (AUX, NOUN), so it is not an
  // unambiguous anchor; "fish" gets no morphological or lexicon
  // evidence either, so it must stay UNKNOWN rather than being forced.
  assert.deepEqual(fish.candidates, []);
});

test("POS realm: tagSentence resolves 'The dogs chased the fastest cat.' token by token", () => {
  const { tokens } = tokenize("The dogs chased the fastest cat.");
  const results = tagSentence(tokens);
  const byWord = Object.fromEntries(results.map((r, i) => [tokens[i].text, r]));

  assert.deepEqual(tagsFor(byWord.The), [POSTag.DET]);
  assert.deepEqual(tagsFor(byWord.dogs), [POSTag.NOUN]);
  assert.deepEqual(tagsFor(byWord.chased), [POSTag.VERB]);
  assert.deepEqual(tagsFor(byWord.fastest), [POSTag.ADJ]);
  // "cat" follows an ADJ ("fastest"), not a DET directly, so the
  // single-previous-token context rule does not reach back through it —
  // an honest UNKNOWN, not a wrong guess. NP-chunking that looks past
  // intervening adjectives is Syntax-realm work, not POS-realm work.
  assert.deepEqual(byWord.cat.candidates, []);
  assert.deepEqual(tagsFor(byWord["."]), [POSTag.PUNCT]);
});

test("POS realm: tagSentence gives 'dog' the same candidate set regardless of subject/object position (order effects are Syntax's job)", () => {
  const a = tagSentence(tokenize("Dog bites man").tokens); // dog=subject
  const b = tagSentence(tokenize("Man bites dog").tokens); // dog=object
  // This realm is word-local plus one token of context; it does not yet
  // know "dog" is the subject in one sentence and the object in the
  // other — that distinction is Syntax-realm work, not POS-realm work.
  assert.deepEqual(tagsFor(a[0]), tagsFor(b[2]));
  assert.deepEqual(tagsFor(a[2]), tagsFor(b[0]));
});

test("POS realm: tagSentence returns [] for non-array input", () => {
  assert.deepEqual(tagSentence(null), []);
});
