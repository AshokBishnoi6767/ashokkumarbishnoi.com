"use strict";

const { listCapabilities, getCapability } = require("../registry/capabilities");
const { getConnection } = require("../connection/manager");
const { runAction } = require("../actions/lifecycle");

// The Tool Router's contract with the rest of the intelligence core:
// reason about a required capability, never a provider's implementation
// details. It does not decide authorization itself — that still happens
// inside runAction()/auth/authorization.js — this only picks a candidate
// and exposes what's currently usable, so the AI layer never invents or
// assumes a capability the registry doesn't actually list.
function findCapabilitiesByName(namePattern) {
  return listCapabilities().filter((c) => c.capability_id.includes(namePattern));
}

function describeAvailability(capabilityId) {
  const capability = getCapability(capabilityId);
  if (!capability) {
    return { capability_id: capabilityId, available: false, reason: "CAPABILITY_NOT_AVAILABLE" };
  }
  const connection = getConnection(capability.tool_id);
  return {
    capability_id: capabilityId,
    available: connection.state === "AUTHORIZED" || connection.state === "PARTIALLY_AUTHORIZED",
    status: capability.status,
    risk_level: capability.risk_level,
    requires_confirmation: capability.requires_confirmation,
    connection_state: connection.state,
    credential_available: connection.credential.credential_available,
  };
}

// Thin pass-through to the Action Lifecycle — kept here so intelligence
// code has one entry point ("route a request for this capability") instead
// of importing the lifecycle module directly.
function route(request) {
  return runAction(request);
}

module.exports = { findCapabilitiesByName, describeAvailability, route };
