"use strict";

const { ResultStatus } = require("../../shared/constants");
const { assertConnectorShape } = require("./connector");

// Proves the connector contract end-to-end with no real external system,
// no network call, and no credential of any kind.
const store = new Map();

const mockConnector = {
  tool_id: "mock",

  listCapabilities() {
    return ["mock.ping", "mock.create_record"];
  },

  execute(capabilityId, params) {
    if (capabilityId === "mock.ping") {
      return { action_ref: "ping-" + Date.now(), status: ResultStatus.SUCCESS };
    }
    if (capabilityId === "mock.create_record") {
      const id = "rec-" + (store.size + 1);
      store.set(id, { name: params.name });
      return { action_ref: id, status: ResultStatus.SUCCESS };
    }
    return { action_ref: null, status: ResultStatus.FAILED };
  },

  verify(capabilityId, actionRef, params) {
    if (capabilityId === "mock.ping") {
      return { verified: true, outcome: ResultStatus.SUCCESS };
    }
    if (capabilityId === "mock.create_record") {
      const record = store.get(actionRef);
      const matches = !!record && record.name === params.name;
      return { verified: matches, outcome: matches ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
    }
    return { verified: false, outcome: ResultStatus.UNKNOWN };
  },

  health() {
    return {
      connected: true,
      last_success_at: new Date().toISOString(),
      last_failure_at: null,
    };
  },
};

assertConnectorShape(mockConnector);

module.exports = mockConnector;
