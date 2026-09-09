"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { understand } = require("../language/understanding");

test("language: represents intent for a question", () => {
  const result = understand("What changed today?");
  assert.equal(result.intent, "QUESTION");
  assert.equal(result.ambiguous, false);
});

test("language: represents intent for a statement", () => {
  const result = understand("Deploy the website.");
  assert.equal(result.intent, "STATEMENT");
});

test("language: flags ambiguity explicitly instead of silently resolving it", () => {
  const result = understand("Send it now.");
  assert.equal(result.ambiguous, true);
  assert.ok(result.ambiguity_reason);
});

test("language: empty input is represented as ambiguous with a reason, not guessed", () => {
  const result = understand("");
  assert.equal(result.intent, null);
  assert.equal(result.ambiguous, true);
  assert.ok(result.ambiguity_reason);
});
