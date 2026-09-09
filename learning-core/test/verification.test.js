"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { verifyOutcome } = require("../verification/verify");

test("verification: SUCCESS only when the independent check confirms it", () => {
  const result = verifyOutcome(() => true);
  assert.equal(result.verified, true);
  assert.equal(result.outcome, "SUCCESS");
});

test("verification: UNKNOWN when the independent check fails to confirm", () => {
  const result = verifyOutcome(() => false);
  assert.equal(result.verified, false);
  assert.equal(result.outcome, "UNKNOWN");
});

test("verification: UNKNOWN (not a crash) when the check itself throws", () => {
  const result = verifyOutcome(() => { throw new Error("read-back failed"); });
  assert.equal(result.outcome, "UNKNOWN");
  assert.match(result.reason, /read-back failed/);
});

test("verification: UNKNOWN when no verification method exists at all", () => {
  const result = verifyOutcome(undefined);
  assert.equal(result.outcome, "UNKNOWN");
  assert.ok(result.reason);
});
