"use strict";

// Durable queue of actions blocked on PENDING_CONFIRMATION so a human can
// review and decide on them from the dashboard — not just in the chat
// thread that happened to propose them. Backed by fileStore so a pending
// approval survives a restart instead of being silently forgotten. Never
// holds a credential; only capability_id/params/who/why, matching the
// audit log's own no-secrets rule.
const fileStore = require("../../persistence/fileStore");
const { newApprovalId } = require("../../shared/ids");

const COLLECTION = "pending_approvals";

function loadApprovals() {
  const raw = fileStore.load(COLLECTION, []);
  return new Map(raw.map((record) => [record.approval_id, record]));
}

const approvals = loadApprovals();

function persist() {
  fileStore.save(COLLECTION, Array.from(approvals.values()));
}

function createPendingApproval({ capabilityId, params, requestedBy, why }) {
  const record = {
    approval_id: newApprovalId(),
    capability_id: capabilityId,
    params: params || {},
    requested_by: requestedBy,
    why: why || null,
    status: "PENDING",
    created_at: new Date().toISOString(),
    resolved_at: null,
    resulting_action_id: null,
  };
  approvals.set(record.approval_id, record);
  persist();
  return record;
}

function listPendingApprovals() {
  return Array.from(approvals.values())
    .filter((r) => r.status === "PENDING")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function listAllApprovals() {
  return Array.from(approvals.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function getApproval(approvalId) {
  return approvals.get(approvalId) || null;
}

function resolveApproval(approvalId, status, resultingActionId = null) {
  const record = approvals.get(approvalId);
  if (!record) return null;
  record.status = status;
  record.resolved_at = new Date().toISOString();
  record.resulting_action_id = resultingActionId;
  approvals.set(approvalId, record);
  persist();
  return record;
}

function _reset() {
  approvals.clear();
  persist();
}

module.exports = { createPendingApproval, listPendingApprovals, listAllApprovals, getApproval, resolveApproval, _reset };
