"use strict";

const { AuthState } = require("../../shared/constants");
const { setConnectionState, getConnectionState } = require("../connection/store");

// Provider-independent orchestrator over connect()/authenticate() /
// getStatus(). Provider-specific mechanics (OAuth vs API key vs service
// account) live in each connector; this module only records the outcome.
// It never receives or stores the credential value itself.
function authenticate(toolId, connector) {
  if (!connector || typeof connector.authenticate !== "function") {
    return setConnectionState(toolId, { state: AuthState.ERROR });
  }
  let result;
  try {
    result = connector.authenticate();
  } catch (err) {
    return setConnectionState(toolId, { state: AuthState.ERROR, last_failure_at: new Date().toISOString() });
  }
  return setConnectionState(toolId, {
    state: result.state,
    scopes: result.scopes || getConnectionState(toolId).scopes,
    ...(result.state === AuthState.AUTHENTICATED || result.state === AuthState.AUTHORIZED
      ? { last_success_at: new Date().toISOString() }
      : { last_failure_at: new Date().toISOString() }),
  });
}

function revoke(toolId) {
  return setConnectionState(toolId, { state: AuthState.REVOKED, scopes: [] });
}

function getStatus(toolId) {
  return getConnectionState(toolId).state;
}

module.exports = { authenticate, revoke, getStatus };
