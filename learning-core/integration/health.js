"use strict";

const { listTools } = require("./registry/tools");
const { getConnectionState } = require("./connection/store");
const mockConnector = require("./connectors/mockConnector");
const githubConnector = require("./connectors/githubConnector");

const CONNECTORS = { mock: mockConnector, github: githubConnector };

function integrationHealth() {
  return listTools().map((tool) => {
    const connection = getConnectionState(tool.tool_id);
    const connector = CONNECTORS[tool.tool_id];
    const live = connector ? connector.healthCheck() : null;
    return {
      tool_id: tool.tool_id,
      status: tool.status,
      connection_state: connection.state,
      connector_implemented: !!connector,
      health_state: live ? live.state : "UNKNOWN",
      failure_count: live ? live.failure_count : null,
      last_success_at: live ? live.last_success_at : null,
      last_failure_at: live ? live.last_failure_at : null,
    };
  });
}

module.exports = { integrationHealth };
