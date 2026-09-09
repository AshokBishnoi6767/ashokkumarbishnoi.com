"use strict";

const REQUIRED_FIELDS = ["event_id", "provider", "normalized_type", "occurred_at"];

function validateNormalizedEvent(event) {
  const missing = REQUIRED_FIELDS.filter((f) => !event || event[f] === undefined);
  return missing.length === 0 ? null : `Missing fields: ${missing.join(", ")}`;
}

module.exports = { validateNormalizedEvent };
