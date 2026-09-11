"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractArithmeticIntent } = require("../language/mathIntent");

test("mathIntent: recognizes a bare arithmetic expression", () => {
  const result = extractArithmeticIntent("2 + 2");
  assert.equal(result.matched, true);
  assert.equal(result.operation, "add");
  assert.deepEqual(result.params, [2, 2]);
});

test("mathIntent: recognizes a question-wrapped expression with trailing punctuation", () => {
  const result = extractArithmeticIntent("What is 2 + 2?");
  assert.equal(result.matched, true);
  assert.equal(result.operation, "add");
  assert.deepEqual(result.params, [2, 2]);
});

test("mathIntent: recognizes multiply/divide/subtract with symbol variants", () => {
  assert.equal(extractArithmeticIntent("15 * 3").operation, "multiply");
  assert.equal(extractArithmeticIntent("15 x 3").operation, "multiply");
  assert.equal(extractArithmeticIntent("15 × 3").operation, "multiply");
  assert.equal(extractArithmeticIntent("10 / 2").operation, "divide");
  assert.equal(extractArithmeticIntent("10 ÷ 2").operation, "divide");
  assert.equal(extractArithmeticIntent("10 - 4").operation, "subtract");
});

test("mathIntent: recognizes sqrt phrasing", () => {
  assert.deepEqual(extractArithmeticIntent("sqrt of 16"), {
    matched: true,
    operation: "sqrt",
    params: [16],
    expression: "sqrt(16)",
  });
  assert.equal(extractArithmeticIntent("square root of 25").operation, "sqrt");
  assert.equal(extractArithmeticIntent("Calculate sqrt(9)").operation, "sqrt");
});

test("mathIntent: never matches ordinary prose that merely contains numbers", () => {
  assert.equal(extractArithmeticIntent("I need 2-3 examples of this.").matched, false);
  assert.equal(extractArithmeticIntent("We closed 5 deals last quarter.").matched, false);
  assert.equal(extractArithmeticIntent("Call me at 555-1234.").matched, false);
});

test("mathIntent: never matches multi-operator/algebraic input — reports unmatched, never guesses", () => {
  assert.equal(extractArithmeticIntent("2 + 2 + 2").matched, false);
  assert.equal(extractArithmeticIntent("solve for x: 2x + 3 = 7").matched, false);
});

test("mathIntent: non-string input is reported unmatched, not thrown", () => {
  assert.equal(extractArithmeticIntent(null).matched, false);
  assert.equal(extractArithmeticIntent(undefined).matched, false);
  assert.equal(extractArithmeticIntent(42).matched, false);
});
