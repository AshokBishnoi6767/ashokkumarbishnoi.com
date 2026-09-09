"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { describeAvailability, findCapabilitiesByName, route } = require("../integration/router/toolRouter");

test("tool router: reports availability for a real, connected, authorized capability", () => {
  const availability = describeAvailability("mock.ping");
  assert.equal(availability.available, true);
});

test("tool router: reports unavailable for a real but disconnected capability, without inventing one", () => {
  const availability = describeAvailability("github.get_repository");
  assert.equal(availability.available, false);
  assert.equal(availability.credential_available, false);
});

test("tool router: reports CAPABILITY_NOT_AVAILABLE for a capability that doesn't exist, not a guess", () => {
  const availability = describeAvailability("made.up.capability");
  assert.equal(availability.available, false);
  assert.equal(availability.reason, "CAPABILITY_NOT_AVAILABLE");
});

test("tool router: can find capabilities by name fragment without the caller knowing the provider", () => {
  const matches = findCapabilitiesByName("github.");
  assert.ok(matches.length >= 2);
});

test("tool router: route() delegates to the same action lifecycle used everywhere else", async () => {
  const result = await route({ capabilityId: "mock.ping", requestedBy: "router-test", why: "delegation check" });
  assert.equal(result.result, "SUCCESS");
});
