"use strict";

const { getCapability } = require("../registry/capabilities");
const { getAuthState, isAuthorizedFor } = require("../auth/store");
const { ActionStatus, ResultStatus } = require("../../shared/constants");
const mockConnector = require("../connectors/mockConnector");
const { recordAudit } = require("../audit/log");

// Only the mock tool has a connector implementation right now.
const CONNECTORS = { mock: mockConnector };

let actionCounter = 0;

function finish(fields) {
  const record = {
    action_id: fields.actionId,
    who: fields.requestedBy,
    why: fields.why,
    when: new Date().toISOString(),
    tool: fields.tool || null,
    capability: fields.capabilityId,
    authorization_state_at_time: fields.authStatus || "UNKNOWN",
    action_status: fields.actionStatus,
    result: fields.resultStatus,
    verified: !!fields.verified,
    action_ref: fields.actionRef || null,
    note: fields.note || null,
  };
  recordAudit(record);
  // LEARN: in the full Learning Core this writes a learning event into
  // Memory. That subsystem doesn't exist yet, so this step is a no-op.
  return record;
}

function runAction({ capabilityId, params = {}, requestedBy, why, confirmed = false }) {
  const actionId = "action-" + ++actionCounter;
  const common = { actionId, capabilityId, requestedBy, why };

  // CHECK CAPABILITY — never assume something exists that isn't registered.
  const capability = getCapability(capabilityId);
  if (!capability) {
    return finish({
      ...common,
      actionStatus: ActionStatus.CAPABILITY_NOT_AVAILABLE,
      resultStatus: ResultStatus.BLOCKED,
      note: "Capability not registered.",
    });
  }

  // CHECK AUTHORIZATION
  const authState = getAuthState(capability.tool_id);
  if (!isAuthorizedFor(capability.tool_id, capabilityId)) {
    return finish({
      ...common,
      tool: capability.tool_id,
      authStatus: authState.status,
      actionStatus: ActionStatus.NOT_AUTHORIZED,
      resultStatus: ResultStatus.BLOCKED,
      note: `Tool '${capability.tool_id}' is ${authState.status}, not authorized.`,
    });
  }

  // CHECK RISK / REQUEST CONFIRMATION — proposal != authorization.
  if (capability.requires_confirmation && !confirmed) {
    return finish({
      ...common,
      tool: capability.tool_id,
      authStatus: authState.status,
      actionStatus: ActionStatus.PENDING_CONFIRMATION,
      resultStatus: ResultStatus.EXPECTED,
      note: "Requires explicit confirmation before execution.",
    });
  }

  const connector = CONNECTORS[capability.tool_id];
  if (!connector) {
    return finish({
      ...common,
      tool: capability.tool_id,
      authStatus: authState.status,
      actionStatus: ActionStatus.CAPABILITY_NOT_AVAILABLE,
      resultStatus: ResultStatus.BLOCKED,
      note: "No connector implementation for this tool yet.",
    });
  }

  // EXECUTE
  let execResult;
  try {
    execResult = connector.execute(capabilityId, params);
  } catch (err) {
    return finish({
      ...common,
      tool: capability.tool_id,
      authStatus: authState.status,
      actionStatus: ActionStatus.COMPLETED,
      resultStatus: ResultStatus.FAILED,
      note: "Connector threw: " + err.message,
    });
  }

  // OBSERVE RESULT + VERIFY — never trust a response as success on its own.
  const verification = connector.verify(capabilityId, execResult.action_ref, params);

  return finish({
    ...common,
    tool: capability.tool_id,
    authStatus: authState.status,
    actionStatus: ActionStatus.COMPLETED,
    resultStatus: verification.outcome,
    verified: verification.verified,
    actionRef: execResult.action_ref,
  });
}

module.exports = { runAction };
