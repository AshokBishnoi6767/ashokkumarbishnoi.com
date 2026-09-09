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

test("temporal: CRITICAL — 'today' near a UTC midnight boundary resolves to a DIFFERENT date in a timezone that has already crossed into tomorrow", () => {
  // 2026-09-09T23:30:00Z is still Sep 9 in UTC, but already Sep 10 in
  // Asia/Kolkata (UTC+5:30). If timezone were silently ignored (as it was
  // before this fix), both would incorrectly return the same date.
  const now = new Date("2026-09-09T23:30:00.000Z");
  const utcToday = resolveTemporalExpression("today", { now, timezone: "UTC" });
  const kolkataToday = resolveTemporalExpression("today", { now, timezone: "Asia/Kolkata" });
  assert.equal(utcToday.resolved_date, "2026-09-09");
  assert.equal(kolkataToday.resolved_date, "2026-09-10");
});

test("temporal: an invalid IANA timezone is reported as unresolved, not silently defaulted", () => {
  const result = resolveTemporalExpression("today", { timezone: "Not/AZone" });
  assert.equal(result.resolved, false);
  assert.match(result.reason, /timezone/i);
});
