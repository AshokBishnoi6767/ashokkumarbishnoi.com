"use strict";

// PARTIAL implementation. Resolves only the unambiguous relative-to-now
// cases (today/tomorrow/yesterday). Everything else — "next Thursday",
// "before the meeting" — comes back unresolved rather than guessed: those
// require calendar/conversation context this phase doesn't have yet.
//
// "Today" is computed AS PERCEIVED IN THE GIVEN TIMEZONE (via Intl), not
// in UTC or the server's local zone — near a midnight boundary, "tomorrow"
// in Asia/Kolkata and "tomorrow" in UTC can genuinely be different dates.
// When no timezone is supplied, this still defaults to "UTC" — callers
// that need a real answer must supply the resolved timezone explicitly
// rather than relying on this default.
function getDatePartsInTimezone(date, timezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDaysToISODate(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return utcDate.toISOString().slice(0, 10);
}

function resolveTemporalExpression(expression, { now = new Date(), timezone = "UTC" } = {}) {
  const normalized = String(expression || "").trim().toLowerCase();
  const offsetByExpression = { today: 0, tomorrow: 1, yesterday: -1 };

  if (!Object.prototype.hasOwnProperty.call(offsetByExpression, normalized)) {
    return {
      expression,
      resolved: false,
      resolved_date: null,
      timezone,
      reason: "Expression is outside the Phase 1 resolvable set (today/tomorrow/yesterday).",
    };
  }

  let todayInZone;
  try {
    todayInZone = getDatePartsInTimezone(now, timezone);
  } catch (err) {
    return { expression, resolved: false, resolved_date: null, timezone, reason: `Unrecognized IANA timezone: '${timezone}'.` };
  }

  return {
    expression,
    resolved: true,
    resolved_date: addDaysToISODate(todayInZone, offsetByExpression[normalized]),
    timezone,
    basis: "now",
  };
}

module.exports = { resolveTemporalExpression };
