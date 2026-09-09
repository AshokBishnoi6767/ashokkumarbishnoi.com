"use strict";

const { ResultStatus, HealthState, AuthState } = require("../../shared/constants");
const { assertConnectorShape } = require("./connector");

// Proves the connector contract end-to-end with no real external system,
// no network call, and no credential of any kind.
const store = new Map();

const mockConnector = {
  tool_id: "mock",

  connect() {
    return { connected: true };
  },

  disconnect() {
    return { connected: false };
  },

  authenticate() {
    return { state: AuthState.AUTHORIZED, scopes: ["read", "write"] };
  },

  getCapabilities() {
    return ["mock.ping", "mock.create_record", "mock.high_risk_op"];
  },

  execute(capabilityId, params) {
    if (capabilityId === "mock.ping" || capabilityId === "mock.high_risk_op") {
      return { action_ref: capabilityId.replace(".", "-") + "-" + Date.now(), status_code: 200, status: ResultStatus.SUCCESS };
    }
    if (capabilityId === "mock.create_record") {
      const id = "rec-" + (store.size + 1);
      store.set(id, { name: params.name });
      return { action_ref: id, status_code: 201, status: ResultStatus.SUCCESS };
    }
    return { action_ref: null, status_code: 400, status: ResultStatus.FAILED };
  },

  verify(capabilityId, actionRef, params) {
    if (capabilityId === "mock.ping" || capabilityId === "mock.high_risk_op") {
      return { verified: true, outcome: ResultStatus.SUCCESS };
    }
    if (capabilityId === "mock.create_record") {
      const record = store.get(actionRef);
      const matches = !!record && record.name === params.name;
      return { verified: matches, outcome: matches ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
    }
    return { verified: false, outcome: ResultStatus.UNKNOWN };
  },

  normalizeResult(raw) {
    if (raw.status_code >= 200 && raw.status_code < 300) return ResultStatus.SUCCESS;
    if (raw.status_code >= 400 && raw.status_code < 500) return ResultStatus.FAILED;
    return ResultStatus.UNKNOWN;
  },

  healthCheck() {
    return { state: HealthState.HEALTHY, last_success_at: new Date().toISOString(), last_failure_at: null, failure_count: 0 };
  },

  handleEvent(rawEvent) {
    return { event_id: rawEvent.event_id, normalized_type: "mock." + (rawEvent.type || "event"), occurred_at: rawEvent.occurred_at || new Date().toISOString(), signature_verified: true };
  },
};

assertConnectorShape(mockConnector);

module.exports = mockConnector;
