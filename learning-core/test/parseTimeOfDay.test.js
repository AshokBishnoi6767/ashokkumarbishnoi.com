"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseTimeOfDay } = require("../temporal/parseTimeOfDay");

test("parseTimeOfDay: '2 PM' resolves to 14:00", () => {
  assert.equal(parseTimeOfDay("2 PM").time_24h, "14:00");
});

test("parseTimeOfDay: '2:30pm' resolves to 14:30", () => {
  assert.equal(parseTimeOfDay("2:30pm").time_24h, "14:30");
});

test("parseTimeOfDay: '12 AM' resolves to 00:00 (midnight edge case)", () => {
  assert.equal(parseTimeOfDay("12 AM").time_24h, "00:00");
});

test("parseTimeOfDay: '12 PM' resolves to 12:00 (noon edge case)", () => {
  assert.equal(parseTimeOfDay("12 PM").time_24h, "12:00");
});

test("parseTimeOfDay: '14:00' (24h, no meridiem) resolves directly", () => {
  assert.equal(parseTimeOfDay("14:00").time_24h, "14:00");
});

test("parseTimeOfDay: unrecognized text is unresolved, not guessed", () => {
  const result = parseTimeOfDay("sometime later");
  assert.equal(result.resolved, false);
  assert.equal(result.time_24h, null);
});

test("parseTimeOfDay: out-of-range hour is unresolved", () => {
  assert.equal(parseTimeOfDay("13 PM").resolved, false);
});
