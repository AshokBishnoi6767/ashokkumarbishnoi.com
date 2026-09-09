"use strict";

const { AuthState } = require("../../shared/constants");
const credentials = require("../credentials/reference");

// Single source of truth for connection state — the Connection Manager,
// Authentication, and Authorization modules all read/write through here
// rather than keeping their own copies. In-memory for Phase 2; a later
// phase persists this as one Firestore document per tool (never the
// credential value itself — see credentials/reference.js).
function initialStateFor(toolId) {
  return credentials.isAvailable(toolId) ? AuthState.CONNECTED : AuthState.DISCONNECTED;
}

const RECORDS = new Map(
  [
    ["mock", { provider_id: "internal", scopes: ["read", "write"], forcedState: AuthState.AUTHORIZED }],
    // Deliberately starts with only read access, not full write — this is
    // what demonstrates "connected but missing the required permission"
    // realistically, without special-casing it inside a test.
    ["test_calendar", { provider_id: "internal", scopes: ["calendar.events.readonly"], forcedState: AuthState.PARTIALLY_AUTHORIZED }],
    ["website", { provider_id: "self" }],
    ["github", { provider_id: "github" }],
    ["calendly", { provider_id: "calendly" }],
    ["hubspot", { provider_id: "hubspot" }],
    ["google_calendar", { provider_id: "google_calendar" }],
    ["gmail", { provider_id: "gmail" }],
    ["whatsapp", { provider_id: "whatsapp" }],
    ["linkedin", { provider_id: "linkedin" }],
  ].map(([toolId, seed]) => [
    toolId,
    {
      tool_id: toolId,
      provider_id: seed.provider_id,
      state: seed.forcedState || initialStateFor(toolId),
      scopes: seed.scopes || [],
      expires_at: null,
      last_success_at: null,
      last_failure_at: null,
    },
  ])
);

function getConnectionState(toolId) {
  return RECORDS.get(toolId) || { tool_id: toolId, provider_id: null, state: AuthState.DISCONNECTED, scopes: [], expires_at: null, last_success_at: null, last_failure_at: null };
}

function setConnectionState(toolId, patch) {
  const current = getConnectionState(toolId);
  const updated = { ...current, ...patch };
  RECORDS.set(toolId, updated);
  return updated;
}

function listConnectionStates() {
  return Array.from(RECORDS.values());
}

module.exports = { getConnectionState, setConnectionState, listConnectionStates };
