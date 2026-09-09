"use strict";

// Narrow, honest parser: "2 PM", "2:30pm", "14:00". Anything else comes
// back unresolved rather than guessed — same principle as resolve.js.
function parseTimeOfDay(expression) {
  const raw = String(expression || "").trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return { expression: raw, resolved: false, time_24h: null, reason: "Unrecognized time-of-day format." };
  }
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3] ? match[3].toLowerCase() : null;

  if (minute > 59) {
    return { expression: raw, resolved: false, time_24h: null, reason: "Minute out of range." };
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return { expression: raw, resolved: false, time_24h: null, reason: "Hour out of range for 12-hour clock." };
    }
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return { expression: raw, resolved: false, time_24h: null, reason: "Hour out of range for 24-hour clock." };
  }

  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return { expression: raw, resolved: true, time_24h: `${hh}:${mm}` };
}

module.exports = { parseTimeOfDay };
