"use strict";

const { AuthState } = require("../../shared/constants");
const { getConnectionState } = require("../connection/store");

const AUTHORIZED_STATES = new Set([AuthState.AUTHORIZED, AuthState.PARTIALLY_AUTHORIZED]);

// Capability-level authorization. The model never decides its own
// authority — this is the only place that answers "is this actually
// allowed", based on live connection state, not on what the model believes.
function authorize(capability) {
  if (!capability) {
    return { authorized: false, reason: "CAPABILITY_NOT_AVAILABLE" };
  }
  const connection = getConnectionState(capability.tool_id);
  if (!AUTHORIZED_STATES.has(connection.state)) {
    return { authorized: false, reason: `Tool '${capability.tool_id}' is ${connection.state}, not authorized.`, connection_state: connection.state };
  }
  if (capability.required_scope && !connection.scopes.includes(capability.required_scope)) {
    return { authorized: false, reason: `Missing required scope '${capability.required_scope}'.`, connection_state: connection.state };
  }
  return { authorized: true, reason: null, connection_state: connection.state };
}

module.exports = { authorize };
