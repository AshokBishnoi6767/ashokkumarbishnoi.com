"use strict";

const { AuthState } = require("../../shared/constants");
const { getConnectionState } = require("../connection/store");

const CONNECTION_OK = new Set([AuthState.AUTHORIZED, AuthState.PARTIALLY_AUTHORIZED]);

// A capability may declare `providers: [{ tool_id, priority }]` (lower
// number = preferred, e.g. the real provider before the test connector).
// Capabilities without `providers` keep the legacy single `tool_id`
// behavior unchanged — this is additive, not a breaking schema change.
//
// Resolution picks the first candidate whose CONNECTION state qualifies
// (AUTHORIZED/PARTIALLY_AUTHORIZED). It does not check capability-specific
// scope — that remains auth/authorization.js's job once a tool_id is
// chosen, so "connected but missing this capability's required scope"
// still surfaces as a real authorization failure, not a silent skip.
function resolveProviderToolId(capability) {
  const candidates = capability.providers && capability.providers.length ? capability.providers : [{ tool_id: capability.tool_id, priority: 1 }];
  const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
  const tried = sorted.map((c) => c.tool_id);

  for (const candidate of sorted) {
    const connection = getConnectionState(candidate.tool_id);
    if (CONNECTION_OK.has(connection.state)) {
      return { tool_id: candidate.tool_id, tried };
    }
  }
  // Nothing connected: report against the top-priority (preferred/real)
  // candidate so the resulting BLOCKED reason names the right provider.
  return { tool_id: sorted[0].tool_id, tried };
}

module.exports = { resolveProviderToolId };
