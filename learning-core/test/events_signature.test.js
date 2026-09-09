"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { verifyHmacSha256 } = require("../integration/events/signature");
const { toNormalizedEvent } = require("../integration/events/adapters/github");
const { routeEvent } = require("../integration/events/router");

test("signature: a correctly-signed payload verifies", () => {
  const secret = "shh";
  const body = JSON.stringify({ a: 1 });
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyHmacSha256(body, digest, secret), true);
});

test("signature: a tampered payload fails verification (spoofing protection)", () => {
  const secret = "shh";
  const digest = crypto.createHmac("sha256", secret).update(JSON.stringify({ a: 1 })).digest("hex");
  assert.equal(verifyHmacSha256(JSON.stringify({ a: 2 }), digest, secret), false);
});

test("signature: no secret configured never verifies (fails closed, not open)", () => {
  assert.equal(verifyHmacSha256("body", "somehex", undefined), false);
});

test("github adapter: rejects a payload missing delivery/event headers", () => {
  const result = toNormalizedEvent({ headers: {}, rawBody: "{}", secret: "x" });
  assert.equal(result.processing_status, "REJECTED");
});

test("github adapter: rejects malformed JSON even with valid headers", () => {
  const result = toNormalizedEvent({
    headers: { "x-github-delivery": "d1", "x-github-event": "push", "x-hub-signature-256": "sha256=aa" },
    rawBody: "{not json",
    secret: "x",
  });
  assert.equal(result.processing_status, "REJECTED");
});

test("event router: rejects an event whose signature failed verification, even if otherwise well-formed", () => {
  const result = routeEvent({
    event_id: "evt-spoofed",
    provider: "github",
    normalized_type: "github.push",
    occurred_at: new Date().toISOString(),
    signature_verified: false,
  });
  assert.equal(result.processing_status, "REJECTED");
  assert.equal(result.reason, "SIGNATURE_INVALID");
});

test("event router: fails CLOSED when an external-provider event simply omits signature_verified (not just when it's explicitly false)", () => {
  const result = routeEvent({
    event_id: "evt-no-sig-field",
    provider: "github",
    normalized_type: "github.push",
    occurred_at: new Date().toISOString(),
    // signature_verified intentionally absent
  });
  assert.equal(result.processing_status, "REJECTED");
  assert.equal(result.reason, "SIGNATURE_STATUS_REQUIRED");
});

test("event router: internal mock events may omit signature_verified (nothing to sign)", () => {
  const result = routeEvent({
    event_id: "evt-mock-no-sig",
    provider: "mock",
    normalized_type: "mock.pinged",
    occurred_at: new Date().toISOString(),
  });
  assert.equal(result.processing_status, "PROCESSED");
});

test("event router: replaying the exact same verified event twice is caught as a duplicate, not reprocessed", () => {
  const event = {
    event_id: "evt-replay-1",
    provider: "github",
    normalized_type: "github.push",
    occurred_at: new Date().toISOString(),
    signature_verified: true,
  };
  const first = routeEvent(event);
  const second = routeEvent(event);
  assert.equal(first.processing_status, "PROCESSED");
  assert.equal(second.processing_status, "DUPLICATE");
});
