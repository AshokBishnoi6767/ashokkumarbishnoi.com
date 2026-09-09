"use strict";

const { listTools } = require("./registry/tools");
const { getAuthState } = require("./auth/store");
const mockConnector = require("./connectors/mockConnector");

const CONNECTORS = { mock: mockConnector };

function integrationHealth() {
  return listTools().map((tool) => {
    const authState = getAuthState(tool.tool_id);
    const connector = CONNECTORS[tool.tool_id];
    const live = connector ? connector.health() : null;
    return {
      tool_id: tool.tool_id,
      status: tool.status,
      auth_status: authState.status,
      connector_implemented: !!connector,
      last_success_at: live ? live.last_success_at : null,
      last_failure_at: live ? live.last_failure_at : null,
    };
  });
}

module.exports = { integrationHealth };
