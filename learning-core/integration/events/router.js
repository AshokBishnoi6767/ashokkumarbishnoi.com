"use strict";

const { validateNormalizedEvent } = require("./model");
const { EventStatus } = require("../../shared/constants");

// Dedupe by event_id (idempotency), never by arrival order — provider
// events can arrive delayed or out of order.
const SEEN_EVENT_IDS = new Set();
const PROCESSED = [];

function routeEvent(rawEvent) {
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
