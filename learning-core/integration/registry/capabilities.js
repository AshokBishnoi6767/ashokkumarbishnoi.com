"use strict";

const { RiskLevel } = require("../../shared/constants");

// A capability being listed here means "this could work if its tool is
// connected and authorized" — never "this works right now". Runtime
// connected/authorized status always comes from auth/store.js, not from
// this file.
const CAPABILITIES = [
  {
    capability_id: "mock.ping",
    tool_id: "mock",
    description: "Round-trip liveness check against the mock connector.",
    parameters_schema: {},
    risk_level: RiskLevel.READ_ONLY,
    requires_confirmation: false,
    verification_method: "echo_match",
  },
  {
    capability_id: "mock.create_record",
    tool_id: "mock",
    description: "Create a record in the mock connector's in-memory store.",
    parameters_schema: { name: "string" },
    risk_level: RiskLevel.MEDIUM,
    requires_confirmation: true,
    verification_method: "read_back",
  },
  {
    capability_id: "calendly.get_availability",
    tool_id: "calendly",
    description: "Retrieve open slots from a Calendly event type.",
    parameters_schema: { event_type: "string" },
    risk_level: RiskLevel.READ_ONLY,
    requires_confirmation: false,
    verification_method: "not_implemented",
  },
];

function listCapabilities() {
  return CAPABILITIES;
}

function getCapability(capabilityId) {
  return CAPABILITIES.find((c) => c.capability_id === capabilityId) || null;
}

module.exports = { listCapabilities, getCapability };
