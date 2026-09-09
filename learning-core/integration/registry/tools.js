"use strict";

const { ToolStatus } = require("../../shared/constants");

// Superset of real and planned tools. PLANNED entries have no connector and
// exist so the system can say "not connected yet" instead of pretending a
// tool doesn't exist at all.
const TOOLS = [
  {
    tool_id: "mock",
    display_name: "Mock Test Tool",
    provider_id: "internal",
    status: ToolStatus.ENABLED,
    connection_type: "none",
    environment: "test",
    version: "1.0.0",
    documentation_reference: null,
  },
  {
    tool_id: "github",
    display_name: "GitHub",
    provider_id: "github",
    status: ToolStatus.ENABLED,
    connection_type: "api_key",
    environment: "production_api_no_credential_configured",
    version: "1.0.0",
    documentation_reference: "https://docs.github.com/en/rest",
  },
  {
    tool_id: "test_calendar",
    display_name: "Deterministic Test Calendar",
    provider_id: "internal",
    status: ToolStatus.ENABLED,
    connection_type: "none",
    environment: "test",
    version: "1.0.0",
    documentation_reference: null,
  },
  { tool_id: "website", display_name: "This Website", provider_id: "self", status: ToolStatus.PLANNED, connection_type: "none", environment: null, version: null, documentation_reference: null },
  { tool_id: "calendly", display_name: "Calendly", provider_id: "calendly", status: ToolStatus.PLANNED, connection_type: "oauth2", environment: null, version: null, documentation_reference: "https://developer.calendly.com/api-docs" },
  { tool_id: "hubspot", display_name: "HubSpot", provider_id: "hubspot", status: ToolStatus.PLANNED, connection_type: "oauth2", environment: null, version: null, documentation_reference: null },
  {
    tool_id: "google_calendar",
    display_name: "Google Calendar",
    provider_id: "google_calendar",
    status: ToolStatus.ENABLED,
    connection_type: "oauth2",
    environment: "production_api_no_credential_configured",
    version: "1.0.0",
    documentation_reference: "https://developers.google.com/calendar/api/v3/reference/events",
  },
  { tool_id: "gmail", display_name: "Gmail", provider_id: "gmail", status: ToolStatus.PLANNED, connection_type: "oauth2", environment: null, version: null, documentation_reference: null },
  { tool_id: "whatsapp", display_name: "WhatsApp", provider_id: "whatsapp", status: ToolStatus.PLANNED, connection_type: "api_key", environment: null, version: null, documentation_reference: null },
  { tool_id: "linkedin", display_name: "LinkedIn", provider_id: "linkedin", status: ToolStatus.PLANNED, connection_type: "oauth2", environment: null, version: null, documentation_reference: null },
];

function listTools() {
  return TOOLS;
}

function getTool(toolId) {
  return TOOLS.find((t) => t.tool_id === toolId) || null;
}

module.exports = { listTools, getTool };
