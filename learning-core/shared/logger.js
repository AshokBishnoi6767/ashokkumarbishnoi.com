"use strict";

// Structured, secret-safe logging. Any field whose key looks sensitive is
// redacted before it ever reaches stdout/stderr — this is the enforcement
// point for "never log secrets."
const SENSITIVE_KEY_PATTERN = /token|secret|password|api[_-]?key|credential|authorization/i;

function redact(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(val);
  }
  return out;
}

function log(level, event, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
  return entry;
}

module.exports = {
  info: (event, fields) => log("info", event, fields),
  warn: (event, fields) => log("warn", event, fields),
  error: (event, fields) => log("error", event, fields),
  _redact: redact,
};
