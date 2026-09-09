"use strict";

const { ToolStatus } = require("../../shared/constants");

// Superset of real and planned tools. PLANNED entries have no connector and
// exist so the system can say "not connected yet" instead of pretending a
// tool doesn't exist at all.
const TOOLS = [
  {
    tool_id: "mock",
    display_name: "Mock Test Tool",
    provider: "internal",
    status: ToolStatus.ENABLED,
    auth_model: "none",
  },
  { tool_id: "website", display_name: "This Website", provider: "self", status: ToolStatus.PLANNED, auth_model: "none" },
  { tool_id: "calendly", display_name: "Calendly", provider: "calendly", status: ToolStatus.PLANNED, auth_model: "oauth2" },
  { tool_id: "hubspot", display_name: "HubSpot", provider: "hubspot", status: ToolStatus.PLANNED, auth_model: "oauth2" },
  { tool_id: "google_calendar", display_name: "Google Calendar", provider: "google", status: ToolStatus.PLANNED, auth_model: "oauth2" },
  { tool_id: "gmail", display_name: "Gmail", provider: "google", status: ToolStatus.PLANNED, auth_model: "oauth2" },
  { tool_id: "whatsapp", display_name: "WhatsApp", provider: "meta", status: ToolStatus.PLANNED, auth_model: "api_key" },
  { tool_id: "linkedin", display_name: "LinkedIn", provider: "linkedin", status: ToolStatus.PLANNED, auth_model: "oauth2" },
];

function listTools() {
  return TOOLS;
}

function getTool(toolId) {
  return TOOLS.find((t) => t.tool_id === toolId) || null;
}

module.exports = { listTools, getTool };
