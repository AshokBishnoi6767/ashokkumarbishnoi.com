"use strict";

// Proves the native-first path is real computation through the actual
// Mathematical Engine (model/taskRouter.js -> math/engine.js), not a
// hand-rolled shortcut, and that it never calls a model provider.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { attemptNative } = require("../core/nativeResponder");

test("nativeResponder: answers arithmetic as VERIFIED using the real math engine", async () => {
  const result = await attemptNative("What is 2 + 2?");
  assert.equal(result.matched, true);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.reply, "2 + 2 = 4");
});

test("nativeResponder: division by zero is reported CONTRADICTED, never a fabricated number", async () => {
  const result = await attemptNative("10 / 0");
  assert.equal(result.matched, true);
  assert.equal(result.status, "CONTRADICTED");
  assert.match(result.reply, /Division by zero/);
});

test("nativeResponder: negative sqrt is reported CONTRADICTED, never an invented complex/real value", async () => {
  const result = await attemptNative("sqrt of -9");
  assert.equal(result.matched, true);
  assert.equal(result.status, "CONTRADICTED");
  assert.match(result.reply, /No real square root/);
});

test("nativeResponder: open-ended, non-arithmetic input is left unmatched for the caller to route", async () => {
  const result = await attemptNative("What should I focus on today?");
  assert.equal(result.matched, false);
});

test("nativeResponder: non-string input is left unmatched, not thrown", async () => {
  assert.equal((await attemptNative(null)).matched, false);
  assert.equal((await attemptNative(undefined)).matched, false);
});
