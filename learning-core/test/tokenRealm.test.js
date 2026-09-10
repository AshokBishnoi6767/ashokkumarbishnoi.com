"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { TokenType, classify, createToken, tokenize } = require("../language/realm/tokenRealm");

test("token realm: classifies character classes", () => {
  assert.equal(classify("a"), TokenType.WORD);
  assert.equal(classify("Z"), TokenType.WORD);
  assert.equal(classify("7"), TokenType.NUMBER);
  assert.equal(classify("!"), TokenType.PUNCTUATION);
  assert.equal(classify("\u{1F600}"), TokenType.UNKNOWN);
});

test("token realm: creates a single token with an id and offsets", () => {
  const token = createToken("Dog", 0, 3, 0, TokenType.WORD);

  assert.ok(token.id.startsWith("token-"));
  assert.equal(token.text, "Dog");
  assert.equal(token.normalized, "dog");
  assert.equal(token.type, TokenType.WORD);
  assert.equal(token.start, 0);
  assert.equal(token.end, 3);
  assert.equal(token.position, 0);
});

test("token realm: tokenizes a sentence into words and punctuation", () => {
  const result = tokenize("The dog chased the cat.");

  assert.equal(result.state, 1);
  assert.deepEqual(
    result.tokens.map((t) => t.text),
    ["The", "dog", "chased", "the", "cat", "."]
  );
  assert.deepEqual(
    result.tokens.map((t) => t.type),
    [
      TokenType.WORD,
      TokenType.WORD,
      TokenType.WORD,
      TokenType.WORD,
      TokenType.WORD,
      TokenType.PUNCTUATION,
    ]
  );
});

test("token realm: preserves original text and offsets for reconstruction", () => {
  const text = "The dog chased the cat.";
  const result = tokenize(text);

  for (const token of result.tokens) {
    assert.equal(text.slice(token.start, token.end), token.text);
  }
});

test("token realm: position order distinguishes subject/object word order", () => {
  const dogBites = tokenize("Dog bites man");
  const manBites = tokenize("Man bites dog");

  assert.deepEqual(
    dogBites.tokens.map((t) => t.normalized),
    ["dog", "bites", "man"]
  );
  assert.deepEqual(
    manBites.tokens.map((t) => t.normalized),
    ["man", "bites", "dog"]
  );
});

test("token realm: merges consecutive digits into one NUMBER token", () => {
  const result = tokenize("42 dogs");

  assert.equal(result.tokens[0].text, "42");
  assert.equal(result.tokens[0].type, TokenType.NUMBER);
  assert.equal(result.tokens[0].normalized, "42");
});

test("token realm: does not merge adjacent punctuation characters", () => {
  const result = tokenize("Wait...!");

  assert.deepEqual(
    result.tokens.map((t) => t.text),
    ["Wait", ".", ".", ".", "!"]
  );
});

test("token realm: reports UNKNOWN for unrecognized symbols rather than guessing", () => {
  const result = tokenize("dog \u{1F600}");

  assert.equal(result.tokens[1].type, TokenType.UNKNOWN);
  assert.equal(result.tokens[1].text, "\u{1F600}");
});

test("token realm: rejects empty input", () => {
  const result = tokenize("");

  assert.equal(result.state, 0);
  assert.deepEqual(result.tokens, []);
  assert.ok(result.reason);
});

test("token realm: rejects non-string input", () => {
  const result = tokenize(null);

  assert.equal(result.state, 0);
  assert.equal(result.text, null);
  assert.ok(result.reason);
});

test("token realm: whitespace-only input yields no tokens with a clear reason", () => {
  const result = tokenize("   ");

  assert.equal(result.state, 0);
  assert.deepEqual(result.tokens, []);
  assert.ok(result.reason);
});

test("token realm: each token in a sequence has a unique id", () => {
  const result = tokenize("dog dog dog");
  const ids = result.tokens.map((t) => t.id);

  assert.equal(new Set(ids).size, ids.length);
});
