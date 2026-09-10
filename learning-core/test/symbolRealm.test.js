"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  ALPHABET,
  createSymbol,
  createSequence,
} = require("../language/realm/symbolRealm");

test("symbol realm: English alphabet contains 26 symbols", () => {
  assert.equal(ALPHABET.size, 26);
  assert.equal(ALPHABET.has("a"), true);
  assert.equal(ALPHABET.has("z"), true);
});

test("symbol realm: creates a valid symbol", () => {
  const result = createSymbol("A", 0);

  assert.equal(result.state, 1);
  assert.equal(result.symbol, "A");
  assert.equal(result.normalized, "a");
  assert.equal(result.position, 0);
});

test("symbol realm: rejects non-alphabetic symbols", () => {
  const result = createSymbol("7", 0);

  assert.equal(result.state, 0);
  assert.ok(result.reason);
});

test("symbol realm: preserves ordered character sequence", () => {
  const result = createSequence("CAT");

  assert.equal(result.state, 1);
  assert.equal(result.normalized, "cat");
  assert.deepEqual(
    result.symbols.map((symbol) => symbol.normalized),
    ["c", "a", "t"]
  );
});

test("symbol realm: rejects invalid characters in a sequence", () => {
  const result = createSequence("cat!");

  assert.equal(result.state, 0);
  assert.ok(result.reason);
});

test("symbol realm: empty input is invalid", () => {
  const result = createSequence("");

  assert.equal(result.state, 0);
  assert.deepEqual(result.symbols, []);
});
