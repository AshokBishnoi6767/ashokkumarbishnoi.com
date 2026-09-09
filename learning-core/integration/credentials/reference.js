"use strict";

// Credential values never leave this module except through
// getForConnectorUse(), which only a connector's own execute()/
// authenticate() implementation may call, at the moment of making a
// request. The returned value must never be stored, logged, returned to a
// caller outside the connector, or placed in model context, prompts,
// frontend code, or audit records.
//
// Phase 2 placeholder: reads from environment variables. Production wiring
// replaces the lookup inside getForConnectorUse() with Google Cloud Secret
// Manager, behind the same three functions — nothing above this module
// needs to change when that happens.
const SOURCES = new Map([
  ["github", { envVar: "GITHUB_TOKEN", storage: "environment" }],
  ["github_webhook", { envVar: "GITHUB_WEBHOOK_SECRET", storage: "environment" }],
  // Placeholder for a bearer access token only. Real Google OAuth involves
  // a refresh-token flow this milestone does not implement — see the
  // Google Calendar connector's authenticate() for the exact boundary.
  ["google_calendar", { envVar: "GOOGLE_CALENDAR_ACCESS_TOKEN", storage: "environment" }],
]);

function isAvailable(toolId) {
  const source = SOURCES.get(toolId);
  if (!source) return false;
  return !!process.env[source.envVar];
}

// Safe to pass to a model, log, or return over an API — never the raw value.
function describe(toolId) {
  const source = SOURCES.get(toolId);
  if (!source) return { tool_id: toolId, credential_available: false, storage: "none" };
  return {
    tool_id: toolId,
    credential_available: !!process.env[source.envVar],
    storage: source.storage,
  };
}

function getForConnectorUse(toolId) {
  const source = SOURCES.get(toolId);
  if (!source) return null;
  return process.env[source.envVar] || null;
}

module.exports = { isAvailable, describe, getForConnectorUse };
