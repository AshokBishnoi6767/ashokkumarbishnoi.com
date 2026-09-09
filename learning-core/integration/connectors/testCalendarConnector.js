"use strict";

const { ResultStatus, HealthState } = require("../../shared/constants");
const { assertConnectorShape } = require("./connector");

// Deterministic TEST-ONLY connector for calendar.event.create/read. Exists
// so the full lifecycle (including realistic failure modes) can be proven
// without real Google credentials. Never presented as a production
// integration — tool_id "test_calendar" is explicit about that everywhere
// it's registered.
//
// Scenario is selected via params.__test_scenario (defaults to SUCCESS so
// ordinary calls behave like a normal working connector). Four scenarios
// (SUCCESS, AMBIGUOUS_RESULT, VERIFICATION_FAILURE, PARTIAL_RESULT) drive
// real verify() logic against an actual in-memory fake calendar rather
// than returning a hardcoded verification outcome — only the execute()
// step is scripted per scenario, matching what a real provider quirk
// would look like.
const calendarStore = new Map(); // event_id -> stored event
let eventCounter = 0;
let health = { failure_count: 0, last_success_at: null, last_failure_at: null };

function validateParams(params) {
  const missing = ["title", "date", "time", "timezone"].filter((f) => !params[f]);
  return missing.length ? `Missing required parameter(s): ${missing.join(", ")}` : null;
}

const testCalendarConnector = {
  tool_id: "test_calendar",

  connect() {
    return { connected: true };
  },

  disconnect() {
    return { connected: false };
  },

  authenticate() {
    return { state: "PARTIALLY_AUTHORIZED", scopes: ["calendar.events.readonly"] };
  },

  getCapabilities() {
    return ["calendar.event.create", "calendar.event.read"];
  },

  execute(capabilityId, params) {
    if (capabilityId === "calendar.event.read") {
      const event = calendarStore.get(params.event_id);
      if (!event) return { action_ref: null, status: ResultStatus.FAILED, reason: "No such event in the test calendar." };
      return { action_ref: params.event_id, status: ResultStatus.SUCCESS };
    }

    if (capabilityId !== "calendar.event.create") {
      return { action_ref: null, status: ResultStatus.FAILED, reason: "Unsupported capability for this connector." };
    }

    const scenario = params.__test_scenario || "SUCCESS";

    switch (scenario) {
      case "AUTHORIZATION_FAILURE":
        // Simulates the provider itself rejecting a request our own
        // pre-check had already authorized (e.g. a token revoked
        // server-side after our last authorize() check).
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { action_ref: null, status: ResultStatus.BLOCKED, reason: "Provider rejected the request: insufficient permission at time of execution." };

      case "INVALID_PARAMETERS": {
        const reason = validateParams(params) || "Simulated invalid parameters.";
        return { action_ref: null, status: ResultStatus.FAILED, reason };
      }

      case "TIMEOUT":
        // Caught here, never thrown — a timeout gives no evidence either
        // way about whether the write happened, so the lifecycle must
        // never retry it automatically.
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { action_ref: null, status: ResultStatus.UNKNOWN, reason: "Request timed out before a response was received; outcome unknown, not retried." };

      case "PROVIDER_FAILURE":
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { action_ref: null, status: ResultStatus.FAILED, reason: "Simulated provider-side failure (5xx equivalent)." };

      case "VERIFICATION_FAILURE": {
        // Provider claims success but the event is deliberately NOT
        // stored — verify() will find nothing on read-back.
        const id = "evt-vf-" + ++eventCounter;
        health.last_success_at = new Date().toISOString();
        return { action_ref: id, status: ResultStatus.SUCCESS };
      }

      case "AMBIGUOUS_RESULT": {
        // Two candidate events exist with the same title near the
        // requested time — verify() cannot tell which (if either) is
        // the one just created.
        const id = "evt-amb-" + ++eventCounter;
        calendarStore.set(id + "-a", { title: params.title, date: params.date, time: params.time, timezone: params.timezone });
        calendarStore.set(id + "-b", { title: params.title, date: params.date, time: params.time, timezone: params.timezone });
        health.last_success_at = new Date().toISOString();
        return { action_ref: id, status: ResultStatus.SUCCESS, ambiguous_candidates: [id + "-a", id + "-b"] };
      }

      case "PARTIAL_RESULT": {
        // Event is created but with a mismatched field (simulating a
        // provider-side quirk, e.g. a timezone conversion difference).
        const id = "evt-partial-" + ++eventCounter;
        calendarStore.set(id, { title: params.title, date: params.date, time: "23:59", timezone: params.timezone });
        health.last_success_at = new Date().toISOString();
        return { action_ref: id, status: ResultStatus.SUCCESS };
      }

      case "SUCCESS":
      default: {
        const invalidReason = validateParams(params);
        if (invalidReason) return { action_ref: null, status: ResultStatus.FAILED, reason: invalidReason };
        const id = "evt-" + ++eventCounter;
        calendarStore.set(id, { title: params.title, date: params.date, time: params.time, timezone: params.timezone });
        health.last_success_at = new Date().toISOString();
        return { action_ref: id, status: ResultStatus.SUCCESS };
      }
    }
  },

  verify(capabilityId, actionRef, params) {
    if (capabilityId === "calendar.event.read") {
      return { verified: calendarStore.has(actionRef), outcome: calendarStore.has(actionRef) ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
    }
    if (actionRef && actionRef.startsWith("evt-amb-")) {
      return { verified: false, outcome: ResultStatus.UNKNOWN, reason: "Multiple candidate events matched; cannot disambiguate which (if any) was created." };
    }
    if (actionRef && actionRef.startsWith("evt-vf-")) {
      return { verified: false, outcome: ResultStatus.UNKNOWN, reason: "Provider reported success but no matching event was found on read-back." };
    }
    if (actionRef && actionRef.startsWith("evt-partial-")) {
      const event = calendarStore.get(actionRef);
      const matches = event && event.time === params.time;
      return { verified: false, outcome: ResultStatus.PARTIAL, reason: `Event exists but time does not match: expected ${params.time}, found ${event ? event.time : "none"}.` };
    }
    const event = calendarStore.get(actionRef);
    const matches = !!event && event.title === params.title && event.time === params.time;
    return { verified: matches, outcome: matches ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
  },

  normalizeResult(raw) {
    return raw.status || ResultStatus.UNKNOWN;
  },

  healthCheck() {
    return { state: HealthState.HEALTHY, ...health };
  },

  handleEvent() {
    return { processing_status: "REJECTED", reason: "Test connector does not receive external events." };
  },
};

assertConnectorShape(testCalendarConnector);

module.exports = testCalendarConnector;
