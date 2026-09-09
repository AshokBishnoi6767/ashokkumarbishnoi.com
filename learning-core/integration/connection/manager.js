"use strict";

const { getConnectionState, setConnectionState, listConnectionStates } = require("./store");
const { getTool } = require("../registry/tools");
const credentials = require("../credentials/reference");

// Connection Manager: the one place that answers "what is this tool's
// connection state right now" — composed from connection state, the tool
// registry entry, and credential availability, without exposing the
// credential itself.
function getConnection(toolId) {
  const state = getConnectionState(toolId);
  const tool = getTool(toolId);
  return {
    ...state,
    tool_enabled: tool ? tool.status === "ENABLED" : false,
    credential: credentials.describe(toolId),
  };
}

function listConnections() {
  return listConnectionStates().map((record) => getConnection(record.tool_id));
}

function recordSuccess(toolId, patch = {}) {
  return setConnectionState(toolId, { ...patch, last_success_at: new Date().toISOString(), last_failure_at: getConnectionState(toolId).last_failure_at });
}

function recordFailure(toolId, patch = {}) {
  return setConnectionState(toolId, { ...patch, last_failure_at: new Date().toISOString() });
}

module.exports = { getConnection, listConnections, recordSuccess, recordFailure };
