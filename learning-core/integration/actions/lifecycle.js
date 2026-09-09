"use strict";

const { getCapability } = require("../registry/capabilities");
const { getConnectionState } = require("../connection/store");
const { authorize } = require("../auth/authorization");
const { resolveProviderToolId } = require("../registry/providerResolution");
const { ActionStatus, ResultStatus, CapabilityStatus, RiskLevel } = require("../../shared/constants");
const mockConnector = require("../connectors/mockConnector");
const githubConnector = require("../connectors/githubConnector");
const googleCalendarConnector = require("../connectors/googleCalendarConnector");
const testCalendarConnector = require("../connectors/testCalendarConnector");
const { recordAudit } = require("../audit/log");
const approvalsStore = require("../approvals/store");

const CONNECTORS = {
  mock: mockConnector,
  github: githubConnector,
  google_calendar: googleCalendarConnector,
  test_calendar: testCalendarConnector,
};

// Capabilities in these states can never execute, regardless of connection
// state — the registry itself is the first gate against hallucinated or
// not-actually-real capabilities.
const NON_EXECUTABLE_STATUSES = new Set([
  CapabilityStatus.UNKNOWN,
  CapabilityStatus.NOT_SUPPORTED,
  CapabilityStatus.DISABLED,
  CapabilityStatus.MANUAL,
  CapabilityStatus.REQUIRES_SPECIAL_ACCESS,
]);

const ALWAYS_CONFIRM_RISK_LEVELS = new Set([RiskLevel.HIGH, RiskLevel.CRITICAL]);

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
    approval_id: fields.approvalId || null,
  };
  recordAudit(record);
  // LEARN: in the full Learning Core this writes a learning event into
  // Memory. Not implemented here — see learning-core/learning/events.js,
  // which the caller may invoke with this record as evidence.
  return record;
}

async function runAction({ capabilityId, params = {}, requestedBy, why, confirmed = false }) {
  const actionId = "action-" + ++actionCounter;
  const common = { actionId, capabilityId, requestedBy, why };

  // CHECK CAPABILITY — never assume something exists or is usable that
  // isn't registered as SUPPORTED.
  const capability = getCapability(capabilityId);
  if (!capability) {
    return finish({ ...common, actionStatus: ActionStatus.CAPABILITY_NOT_AVAILABLE, resultStatus: ResultStatus.BLOCKED, note: "Capability not registered." });
  }
  if (NON_EXECUTABLE_STATUSES.has(capability.status)) {
    return finish({
      ...common,
      tool: capability.tool_id,
      actionStatus: ActionStatus.CAPABILITY_NOT_AVAILABLE,
      resultStatus: ResultStatus.BLOCKED,
      note: `Capability status is ${capability.status}; not executable regardless of connection state.`,
    });
  }

  // CHECK PROVIDER — capability != tool. A capability may be servable by
  // more than one provider (see registry/providerResolution.js); this
  // picks the best currently-connected candidate, or the preferred/real
  // one if none qualify, so the resulting BLOCKED reason names the right
  // provider rather than an arbitrary one.
  const { tool_id: resolvedToolId, tried } = resolveProviderToolId(capability);
  const resolvedCapability = { ...capability, tool_id: resolvedToolId };

  // CHECK CONNECTION / AUTHORIZATION
  const connection = getConnectionState(resolvedToolId);
  const authResult = authorize(resolvedCapability);
  if (!authResult.authorized) {
    return finish({
      ...common,
      tool: resolvedToolId,
      authStatus: connection.state,
      actionStatus: ActionStatus.NOT_AUTHORIZED,
      resultStatus: ResultStatus.BLOCKED,
      note: `${authResult.reason} (tried: ${tried.join(", ")})`,
    });
  }

  // CHECK RISK / REQUEST APPROVAL — proposal != authorization. A
  // HIGH/CRITICAL risk_level always forces confirmation as defense in
  // depth, independent of the registry's requires_confirmation flag (which
  // a future registry entry could otherwise set incorrectly). No approval
  // means no execution: this is reported as BLOCKED, not merely "pending",
  // because without a confirmed:true on THIS call nothing will execute.
  const confirmationRequired = capability.requires_confirmation || ALWAYS_CONFIRM_RISK_LEVELS.has(capability.risk_level);
  if (confirmationRequired && !confirmed) {
    // Persist the proposal as a pending approval so it's reviewable from
    // the dashboard's Approvals surface, not just recoverable by resending
    // the exact same chat message. Approving it later re-enters this same
    // function with confirmed:true — no separate execution path.
    const pendingApproval = approvalsStore.createPendingApproval({ capabilityId, params, requestedBy, why });
    return finish({
      ...common,
      tool: resolvedToolId,
      authStatus: connection.state,
      actionStatus: ActionStatus.PENDING_CONFIRMATION,
      resultStatus: ResultStatus.BLOCKED,
      note: "Requires explicit approval before execution; none was given on this call.",
      approvalId: pendingApproval.approval_id,
    });
  }

  const connector = CONNECTORS[resolvedToolId];
  if (!connector) {
    return finish({
      ...common,
      tool: resolvedToolId,
      authStatus: connection.state,
      actionStatus: ActionStatus.CAPABILITY_NOT_AVAILABLE,
      resultStatus: ResultStatus.BLOCKED,
      note: "No connector implementation for this tool yet.",
    });
  }

  // EXECUTE — connectors may return sync or async results (real HTTP
  // connectors are inherently async; Promise.resolve normalizes both).
  let execResult;
  try {
    execResult = await Promise.resolve(connector.execute(capabilityId, params));
  } catch (err) {
    return finish({
      ...common,
      tool: resolvedToolId,
      authStatus: connection.state,
      actionStatus: ActionStatus.COMPLETED,
      resultStatus: ResultStatus.FAILED,
      note: "Connector threw: " + err.message,
    });
  }

  // If the connector never produced a durable reference (missing
  // credential, invalid parameters, timeout, provider failure, upstream
  // authorization failure at the provider itself), there is nothing to
  // verify — trust the connector's own declared status as terminal rather
  // than attempting a read-back against nothing.
  if (!execResult.action_ref) {
    return finish({
      ...common,
      tool: resolvedToolId,
      authStatus: connection.state,
      actionStatus: ActionStatus.COMPLETED,
      resultStatus: execResult.status || ResultStatus.UNKNOWN,
      note: execResult.reason || "Connector did not produce a verifiable result.",
    });
  }

  // OBSERVE RESULT + VERIFY — a provider claiming success is never, by
  // itself, treated as SUCCESS; independent read-back decides the outcome.
  const verification = await Promise.resolve(connector.verify(capabilityId, execResult.action_ref, params));

  return finish({
    ...common,
    tool: resolvedToolId,
    authStatus: connection.state,
    actionStatus: ActionStatus.COMPLETED,
    resultStatus: verification.outcome,
    verified: verification.verified,
    actionRef: execResult.action_ref,
    note: verification.reason || null,
  });
}

// Human decision on a pending approval, driven from the dashboard rather
// than the original chat thread. Approving does NOT execute directly —
// it re-enters runAction() with confirmed:true, so the approved action
// still passes through capability/authorization/risk checks exactly as a
// freshly-confirmed chat message would (no separate, weaker execution path).
async function approveAction(approvalId) {
  const pending = approvalsStore.getApproval(approvalId);
  if (!pending) {
    return { status: "NOT_FOUND", reason: "No pending approval with that id." };
  }
  if (pending.status !== "PENDING") {
    return { status: "ALREADY_RESOLVED", reason: `Already ${pending.status}.`, approval: pending };
  }
  const actionRecord = await runAction({
    capabilityId: pending.capability_id,
    params: pending.params,
    requestedBy: pending.requested_by,
    why: pending.why,
    confirmed: true,
  });
  const resolved = approvalsStore.resolveApproval(approvalId, "APPROVED", actionRecord.action_id);
  return { status: "APPROVED", approval: resolved, action: actionRecord };
}

// Rejecting never touches the connector — nothing was executed, so there is
// nothing for the Action Lifecycle to run. The decision itself is still
// recorded to the audit trail: a rejection is an outcome worth remembering.
function rejectAction(approvalId, { rejectedBy = null } = {}) {
  const pending = approvalsStore.getApproval(approvalId);
  if (!pending) {
    return { status: "NOT_FOUND", reason: "No pending approval with that id." };
  }
  if (pending.status !== "PENDING") {
    return { status: "ALREADY_RESOLVED", reason: `Already ${pending.status}.`, approval: pending };
  }
  const resolved = approvalsStore.resolveApproval(approvalId, "REJECTED", null);
  recordAudit({
    action_id: "rejection-" + approvalId,
    who: rejectedBy || pending.requested_by,
    why: `Human rejected proposed action: ${pending.why || pending.capability_id}`,
    when: new Date().toISOString(),
    tool: null,
    capability: pending.capability_id,
    authorization_state_at_time: "N/A",
    action_status: ActionStatus.PENDING_CONFIRMATION,
    result: ResultStatus.BLOCKED,
    verified: false,
    action_ref: null,
    note: "Rejected by human reviewer; never executed.",
    approval_id: approvalId,
  });
  return { status: "REJECTED", approval: resolved };
}

module.exports = { runAction, approveAction, rejectAction };
