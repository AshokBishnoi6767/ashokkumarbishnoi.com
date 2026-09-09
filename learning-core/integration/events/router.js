"use strict";

const { validateNormalizedEvent } = require("./model");
const { EventStatus } = require("../../shared/constants");

// Dedupe by event_id (idempotency), never by arrival order — provider
// events can arrive delayed or out of order.
const SEEN_EVENT_IDS = new Set();
const PROCESSED = [];

// Only internal, unsignable sources may omit signature_verified. Any other
// provider MUST explicitly assert signature_verified === true — an event
// that simply forgets to set the field must fail closed, not pass through
// as if it had been verified.
const UNSIGNED_TRUSTED_PROVIDERS = new Set(["mock", "internal", "self"]);

function routeEvent(rawEvent) {
  // Most specific first: an explicit failed check is always rejected.
  if (rawEvent && rawEvent.signature_verified === false) {
    const rejected = { ...rawEvent, processing_status: EventStatus.REJECTED, reason: "SIGNATURE_INVALID" };
    PROCESSED.push(rejected);
    return rejected;
  }
  // Fail closed on missing status: only internal, unsignable sources may
  // omit signature_verified entirely. Any other provider must explicitly
  // assert signature_verified === true — silence is not verification.
  const isTrustedUnsigned = rawEvent && UNSIGNED_TRUSTED_PROVIDERS.has(rawEvent.provider);
  if (!isTrustedUnsigned && (!rawEvent || rawEvent.signature_verified !== true)) {
    const rejected = { ...rawEvent, processing_status: EventStatus.REJECTED, reason: "SIGNATURE_STATUS_REQUIRED" };
    PROCESSED.push(rejected);
    return rejected;
  }
  const invalidReason = validateNormalizedEvent(rawEvent);
  if (invalidReason) {
    const rejected = { ...rawEvent, processing_status: EventStatus.REJECTED, reason: invalidReason };
    PROCESSED.push(rejected);
    return rejected;
  }
  if (SEEN_EVENT_IDS.has(rawEvent.event_id)) {
    const duplicate = { ...rawEvent, processing_status: EventStatus.DUPLICATE };
    PROCESSED.push(duplicate);
    return duplicate;
  }
  SEEN_EVENT_IDS.add(rawEvent.event_id);
  const processed = { ...rawEvent, processing_status: EventStatus.PROCESSED, received_at: new Date().toISOString() };
  PROCESSED.push(processed);
  return processed;
}

function listProcessed() {
  return PROCESSED.slice();
}

module.exports = { routeEvent, listProcessed };
