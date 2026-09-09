"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

// PARTIAL implementation. Resolves only the unambiguous relative-to-now
// cases (today/tomorrow/yesterday). Everything else — "next Thursday",
// "before the meeting" — comes back unresolved rather than guessed: those
// require calendar/conversation context this phase doesn't have yet.
function resolveTemporalExpression(expression, { now = new Date(), timezone = "UTC" } = {}) {
  const normalized = String(expression || "").trim().toLowerCase();
  const offsetByExpression = { today: 0, tomorrow: 1, yesterday: -1 };

  if (Object.prototype.hasOwnProperty.call(offsetByExpression, normalized)) {
    const resolvedDate = new Date(now.getTime() + offsetByExpression[normalized] * DAY_MS);
    return {
      expression,
      resolved: true,
      resolved_date: resolvedDate.toISOString().slice(0, 10),
      timezone,
      basis: "now",
    };
  }

  return {
    expression,
    resolved: false,
    resolved_date: null,
    timezone,
    reason: "Expression is outside the Phase 1 resolvable set (today/tomorrow/yesterday).",
  };
}

module.exports = { resolveTemporalExpression };
