"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveTemporalExpression } = require("../temporal/resolve");

test("temporal: resolves 'today' relative to now", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const result = resolveTemporalExpression("today", { now });
  assert.equal(result.resolved, true);
  assert.equal(result.resolved_date, "2026-09-09");
});

test("temporal: resolves 'tomorrow' and 'yesterday' relative to now", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  assert.equal(resolveTemporalExpression("tomorrow", { now }).resolved_date, "2026-09-10");
  assert.equal(resolveTemporalExpression("yesterday", { now }).resolved_date, "2026-09-08");
});

test("temporal: records timezone alongside the resolution", () => {
  const result = resolveTemporalExpression("today", { now: new Date(), timezone: "Asia/Kolkata" });
  assert.equal(result.timezone, "Asia/Kolkata");
});

test("temporal: does not guess an unresolvable expression", () => {
  const result = resolveTemporalExpression("next Thursday");
  assert.equal(result.resolved, false);
  assert.equal(result.resolved_date, null);
  assert.ok(result.reason);
});
