"use strict";

const { RiskLevel, CapabilityStatus } = require("../../shared/constants");

// A capability being listed here means "this could work if its tool is
// connected and authorized" — never "this works right now". Runtime
// connected/authorized status always comes from connection/manager.js, not
// from this file. `status` reflects whether the operation is even known to
// be feasible against the real provider (see registry/providers.js notes).
const CAPABILITIES = [
  {
    capability_id: "mock.ping",
    tool_id: "mock",
    description: "Round-trip liveness check against the mock connector.",
    input_schema: {},
    output_schema: { action_ref: "string" },
    risk_level: RiskLevel.READ_ONLY,
    requires_confirmation: false,
    verification_method: "echo_match",
    status: CapabilityStatus.SUPPORTED,
  },
  {
    capability_id: "mock.create_record",
    tool_id: "mock",
    description: "Create a record in the mock connector's in-memory store.",
    input_schema: { name: "string" },
    output_schema: { action_ref: "string" },
    risk_level: RiskLevel.MEDIUM,
    requires_confirmation: true,
    verification_method: "read_back",
    status: CapabilityStatus.SUPPORTED,
  },
  {
    capability_id: "mock.high_risk_op",
    tool_id: "mock",
    // Internal-only fixture (not a real provider capability) proving the
    // lifecycle's risk-level safety net: requires_confirmation is
    // deliberately false here so the test can show risk_level alone still
    // forces confirmation.
    description: "Internal test fixture for the HIGH/CRITICAL risk confirmation override.",
    input_schema: {},
    output_schema: { action_ref: "string" },
    risk_level: RiskLevel.HIGH,
    requires_confirmation: false,
    verification_method: "echo_match",
    status: CapabilityStatus.SUPPORTED,
  },
  {
    capability_id: "github.get_repository",
    tool_id: "github",
    description: "Read a repository's metadata (GET /repos/{owner}/{repo}, verified live against docs.github.com).",
    input_schema: { owner: "string", repo: "string" },
    output_schema: { full_name: "string", private: "boolean", default_branch: "string" },
    risk_level: RiskLevel.READ_ONLY,
    requires_confirmation: false,
    verification_method: "read_back",
    status: CapabilityStatus.SUPPORTED,
  },
  {
    capability_id: "github.list_commits",
    tool_id: "github",
    description: "List commits on a repository (GET /repos/{owner}/{repo}/commits, verified live against docs.github.com).",
    input_schema: { owner: "string", repo: "string", per_page: "number?" },
    output_schema: { commits: "array" },
    risk_level: RiskLevel.READ_ONLY,
    requires_confirmation: false,
    verification_method: "read_back",
    status: CapabilityStatus.SUPPORTED,
  },
  {
    capability_id: "calendar.event.create",
    // Capability != tool: this can be served by more than one provider.
    // `tool_id` is kept for legacy single-provider call sites; `providers`
    // is what actual resolution uses (see registry/providerResolution.js).
    tool_id: "google_calendar",
    providers: [
      { tool_id: "google_calendar", priority: 1 },
      { tool_id: "test_calendar", priority: 2 },
    ],
    description: "Create a calendar event (POST .../calendars/{calendarId}/events, verified live against developers.google.com).",
    input_schema: { title: "string", date: "string (YYYY-MM-DD)", time: "string (HH:MM, 24h)", timezone: "string (IANA name)" },
    output_schema: { event_id: "string" },
    // Per the approved risk classification: creating a calendar event is
    // MEDIUM (write, reversible, low blast radius) — not HIGH/CRITICAL.
    risk_level: RiskLevel.MEDIUM,
    requires_confirmation: true,
    required_scope: "calendar.events.write",
    verification_method: "read_back",
    status: CapabilityStatus.SUPPORTED,
  },
  {
    capability_id: "calendar.event.read",
    tool_id: "google_calendar",
    providers: [
      { tool_id: "google_calendar", priority: 1 },
      { tool_id: "test_calendar", priority: 2 },
    ],
    description: "Read a calendar event by ID (GET .../calendars/{calendarId}/events/{eventId}, verified live against developers.google.com).",
    input_schema: { event_id: "string" },
    output_schema: { title: "string", start: "object", end: "object" },
    risk_level: RiskLevel.READ_ONLY,
    requires_confirmation: false,
    required_scope: "calendar.events.readonly",
    verification_method: "read_back",
    status: CapabilityStatus.SUPPORTED,
  },
  {
    capability_id: "calendly.get_availability",
    tool_id: "calendly",
    description: "Retrieve open slots from a Calendly event type.",
    input_schema: { event_type: "string" },
    output_schema: { slots: "array" },
    risk_level: RiskLevel.READ_ONLY,
    requires_confirmation: false,
    verification_method: "not_implemented",
    // Deliberately UNKNOWN, not SUPPORTED: checked developer.calendly.com
    // this session and could not confirm the public API exposes real-time
    // availability slots at all. Do not implement against this until that
    // is verified against the actual OpenAPI spec.
    status: CapabilityStatus.UNKNOWN,
  },
];

function listCapabilities() {
  return CAPABILITIES;
}

function getCapability(capabilityId) {
  return CAPABILITIES.find((c) => c.capability_id === capabilityId) || null;
}

module.exports = { listCapabilities, getCapability };
