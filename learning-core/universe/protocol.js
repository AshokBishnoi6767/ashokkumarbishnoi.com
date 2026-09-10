"use strict";

/**
 * Trinity Universe — Invocation Protocol Contracts v0.1
 *
 * The "in-flight" counterparts to domain.js's static definitions
 * (Realm, Portal, CommandCenter): the shapes that travel through a
 * portal invocation, a realm-to-realm message, or an orchestration
 * step. Same discipline as domain.js — flat, explicit, validated,
 * frozen, no hidden state, no execution here.
 *
 * === Authorization is represented here, not implemented here ===
 * createAuthorization() produces a plain record of a decision the
 * CALLER already made using the EXISTING action-lifecycle/authorization
 * infrastructure (integration/actions/, integration/safety/) — this
 * module never grants, checks, or enforces anything itself. Portal
 * invocation (portalRegistry.js) requires an Authorization object on
 * every request and refuses to execute without `granted: true`; it
 * never trusts a caller-supplied identity/role string as authority on
 * its own (Phase 19).
 *
 * === Epistemic fields are preserved, never collapsed (Phase 6/29) ===
 * PortalResult carries truth_state, confidence, probability, and
 * uncertainty as four independent fields, exactly like every
 * Proposition/KnowledgeRecord below it in the language chain. UNKNOWN
 * is a first-class, valid `status` — never silently converted into an
 * empty success.
 */

const { AuthorityLevel, RiskLevel, TruthState, ProbabilityStatus, UncertaintyStatus, VerificationOutcome } = require("../shared/constants");
const { requireString, requireArray, requireEnum, makeProvenance } = require("./domain");
const { newCorrelationId } = require("../shared/ids");

const PortalResultStatus = Object.freeze({
  RESULT: "RESULT",
  UNKNOWN: "UNKNOWN",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  UNAUTHORIZED: "UNAUTHORIZED",
  ERROR: "ERROR",
});

// ---------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------

function createAuthorization({ granted, level = null, riskLevel = null, reason = null, grantedBy = null } = {}) {
  if (typeof granted !== "boolean") {
    throw new TypeError("Authorization.granted must be an explicit boolean — authorization is never assumed.");
  }
  if (level !== null) requireEnum(level, AuthorityLevel, "Authorization.level");
  if (riskLevel !== null) requireEnum(riskLevel, RiskLevel, "Authorization.riskLevel");
  return Object.freeze({ granted, level, riskLevel, reason, grantedBy });
}

const DENIED_AUTHORIZATION = createAuthorization({ granted: false, reason: "No authorization supplied." });

// ---------------------------------------------------------------------
// PortalRequest / PortalResult
// ---------------------------------------------------------------------

function createPortalRequest({
  portalId,
  request,
  context = null,
  constraints = [],
  authorization = DENIED_AUTHORIZATION,
  requestedVerificationLevel = null,
  caller = null,
} = {}) {
  requireString(portalId, "PortalRequest.portalId");
  return Object.freeze({
    id: newCorrelationId(),
    portalId,
    request,
    context,
    constraints: requireArray(constraints, "PortalRequest.constraints"),
    authorization,
    requestedVerificationLevel,
    caller,
    provenance: makeProvenance("PORTAL_REQUEST"),
  });
}

function createPortalResult({
  requestId,
  portalId,
  realmId,
  status,
  interpretation = null,
  result = null,
  evidence = [],
  truth_state = TruthState.UNKNOWN,
  confidence = null,
  probability = ProbabilityStatus.NOT_DEFINED,
  uncertainty = UncertaintyStatus.PRESENT,
  verification = null,
  actions = [],
  artifacts = [],
  executionMetadata = {},
  reason = null,
} = {}) {
  requireString(requestId, "PortalResult.requestId");
  requireString(portalId, "PortalResult.portalId");
  requireString(realmId, "PortalResult.realmId");
  requireEnum(status, PortalResultStatus, "PortalResult.status");
  return Object.freeze({
    id: newCorrelationId(),
    requestId,
    portalId,
    realmId,
    status,
    interpretation,
    result,
    evidence: requireArray(evidence, "PortalResult.evidence"),
    // Independent epistemic fields — never derived from one another.
    truth_state,
    confidence,
    probability,
    uncertainty,
    verification,
    actions: requireArray(actions, "PortalResult.actions"),
    artifacts: requireArray(artifacts, "PortalResult.artifacts"),
    realm_identity: realmId,
    executionMetadata,
    reason,
    provenance: makeProvenance("PORTAL_RESULT", { portal_id: portalId, realm_id: realmId }),
  });
}

// ---------------------------------------------------------------------
// RealmMessage (Phase 8: realm-to-realm, never a direct state mutation)
// ---------------------------------------------------------------------

function createRealmMessage({
  sourceRealm,
  targetRealm,
  sourcePortal = null,
  targetPortal,
  purpose,
  payload,
  context = null,
  constraints = [],
  authorization = DENIED_AUTHORIZATION,
  expectedOutput = null,
  verificationRequirement = null,
} = {}) {
  requireString(sourceRealm, "RealmMessage.sourceRealm");
  requireString(targetRealm, "RealmMessage.targetRealm");
  requireString(targetPortal, "RealmMessage.targetPortal");
  requireString(purpose, "RealmMessage.purpose");
  return Object.freeze({
    id: newCorrelationId(),
    sourceRealm,
    targetRealm,
    sourcePortal,
    targetPortal,
    purpose,
    payload,
    context,
    constraints: requireArray(constraints, "RealmMessage.constraints"),
    authorization,
    expectedOutput,
    verificationRequirement,
    provenance: makeProvenance("REALM_MESSAGE", { source_realm: sourceRealm, target_realm: targetRealm }),
  });
}

// ---------------------------------------------------------------------
// CrossRealmRequest (an orchestrator's fan-out to one or more realms)
// ---------------------------------------------------------------------

function createCrossRealmRequest({ requestingRealm = null, targetPortalIds, purpose, payload, context = null, authorization = DENIED_AUTHORIZATION } = {}) {
  requireArray(targetPortalIds, "CrossRealmRequest.targetPortalIds");
  if (targetPortalIds.length === 0) {
    throw new TypeError("CrossRealmRequest.targetPortalIds must name at least one portal.");
  }
  requireString(purpose, "CrossRealmRequest.purpose");
  return Object.freeze({
    id: newCorrelationId(),
    requestingRealm,
    targetPortalIds,
    purpose,
    payload,
    context,
    authorization,
    provenance: makeProvenance("CROSS_REALM_REQUEST"),
  });
}

// ---------------------------------------------------------------------
// OrchestrationPlan / RealmExecution (Phase 9/10: an explicit, inspectable graph)
// ---------------------------------------------------------------------

// A plan step names its portal and its dependencies BY step id — the
// orchestrator (orchestrator.js) reads this graph to decide sequencing
// and safe parallelism; nothing about execution order is hidden inside
// a function call.
function createOrchestrationPlan({ task, requiredCapabilities = [], steps = [] } = {}) {
  requireString(task, "OrchestrationPlan.task");
  requireArray(steps, "OrchestrationPlan.steps");
  for (const step of steps) {
    requireString(step.stepId, "OrchestrationPlan.steps[].stepId");
    requireString(step.portalId, "OrchestrationPlan.steps[].portalId");
    requireArray(step.dependsOn || [], "OrchestrationPlan.steps[].dependsOn");
  }
  return Object.freeze({
    id: newCorrelationId(),
    task,
    requiredCapabilities: requireArray(requiredCapabilities, "OrchestrationPlan.requiredCapabilities"),
    steps: steps.map((s) => Object.freeze({ stepId: s.stepId, portalId: s.portalId, dependsOn: s.dependsOn || [], payload: s.payload ?? null })),
    provenance: makeProvenance("ORCHESTRATION_PLAN"),
  });
}

function createRealmExecution({ planId, stepId, portalId, realmId, status, input = null, portalResult = null }) {
  requireString(planId, "RealmExecution.planId");
  requireString(stepId, "RealmExecution.stepId");
  requireString(portalId, "RealmExecution.portalId");
  requireString(realmId, "RealmExecution.realmId");
  return Object.freeze({
    id: newCorrelationId(),
    planId,
    stepId,
    portalId,
    realmId,
    status,
    input,
    portalResult,
    started_at: new Date().toISOString(),
    provenance: makeProvenance("REALM_EXECUTION", { plan_id: planId, step_id: stepId }),
  });
}

// ---------------------------------------------------------------------
// VerificationResult (Phase 17: cross-realm verification)
// ---------------------------------------------------------------------

// `sources` names every realm/portal that produced a result feeding
// this verification — when they disagree, `status` becomes
// CONFLICTING_RESULTS and BOTH sources remain listed; nothing is
// silently dropped to force a single answer.
function createVerificationResult({ status, sources = [], reason = null } = {}) {
  requireEnum(status, VerificationOutcome, "VerificationResult.status");
  requireArray(sources, "VerificationResult.sources");
  return Object.freeze({
    id: newCorrelationId(),
    status,
    sources,
    reason,
    provenance: makeProvenance("CROSS_REALM_VERIFICATION"),
  });
}

module.exports = {
  PortalResultStatus,
  createAuthorization,
  DENIED_AUTHORIZATION,
  createPortalRequest,
  createPortalResult,
  createRealmMessage,
  createCrossRealmRequest,
  createOrchestrationPlan,
  createRealmExecution,
  createVerificationResult,
};
