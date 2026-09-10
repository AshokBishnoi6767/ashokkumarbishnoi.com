"use strict";

/**
 * Trinity Universe — Synchronous Benchmark/Demo Helpers v0.1
 *
 * core/benchmark.js's runBenchmark() is synchronous by existing,
 * already-checkpointed contract — every case's run() returns
 * immediately, and every caller across this codebase (its own tests,
 * the demo) calls it that way. invokePortal() (portalInvoke.js) is
 * correctly async in general — Phase 25 requires the Portal contract to
 * remain stable for a future async backend (an LLM call, a remote
 * tool) — but every realm bootstrap.js registers in THIS milestone
 * happens to be synchronous under the hood.
 *
 * This module bridges that gap WITHOUT touching benchmark.js's
 * accepted synchronous contract: it re-implements invokePortal's
 * RESOLVE/AUTHORIZE/EXECUTE logic synchronously, and throws loudly
 * (never silently misbehaves) if a registered realm's execute() ever
 * returns a thenable — a genuinely async realm must be invoked through
 * invokePortal() instead, exactly like every other caller
 * (orchestrator.js, crossRealm.js, universePortalInvoke.test.js) does.
 */

const { realmRegistry, portalRegistry, validateRealm } = require("./registry");
const {
  createAuthorization,
  createPortalRequest,
  createPortalResult,
  createOrchestrationPlan,
  createRealmExecution,
  PortalResultStatus,
  DENIED_AUTHORIZATION,
} = require("./protocol");
const { PortalStatus, RealmStatus } = require("../shared/constants");
const { unwrapExecuteOutput } = require("./portalInvoke");
const { crossRealmVerify } = require("./crossRealm");

const EXECUTABLE_REALM_STATUSES = [RealmStatus.EXPERIMENTAL, RealmStatus.IMPLEMENTED, RealmStatus.VERIFIED, RealmStatus.PRODUCTION_READY];
const GRANTED = createAuthorization({ granted: true, level: "EXECUTE" });

function invokeSyncWithAuth(portalId, request, authorization) {
  const req = createPortalRequest({ portalId, request, authorization });

  const portal = portalRegistry.get(portalId);
  if (!portal) {
    return createPortalResult({ requestId: req.id, portalId, realmId: "unresolved", status: PortalResultStatus.ERROR, reason: `No portal registered with id '${portalId}'.` });
  }
  if (portal.status !== PortalStatus.ACTIVE) {
    return createPortalResult({ requestId: req.id, portalId: portal.id, realmId: portal.realmId, status: PortalResultStatus.NOT_IMPLEMENTED, reason: `Portal '${portal.id}' has status ${portal.status}, not ACTIVE.` });
  }

  const realm = realmRegistry.get(portal.realmId);
  if (authorization.granted !== true) {
    return createPortalResult({ requestId: req.id, portalId: portal.id, realmId: realm.id, status: PortalResultStatus.UNAUTHORIZED, reason: authorization.reason || "No granted authorization was supplied." });
  }
  if (!EXECUTABLE_REALM_STATUSES.includes(realm.status) || typeof realm.execute !== "function") {
    return createPortalResult({ requestId: req.id, portalId: portal.id, realmId: realm.id, status: PortalResultStatus.NOT_IMPLEMENTED, reason: `Realm '${realm.id}' has status ${realm.status} — no real execution path exists yet.` });
  }

  let rawOutput;
  try {
    rawOutput = realm.execute(request, { context: null });
    if (rawOutput && typeof rawOutput.then === "function") {
      throw new Error(`Realm '${realm.id}'.execute() returned a Promise — this synchronous benchmark helper cannot await it; use portalInvoke.js's invokePortal() instead.`);
    }
  } catch (err) {
    return createPortalResult({ requestId: req.id, portalId: portal.id, realmId: realm.id, status: PortalResultStatus.ERROR, reason: err.message });
  }

  return createPortalResult({ requestId: req.id, portalId: portal.id, realmId: realm.id, status: PortalResultStatus.RESULT, ...unwrapExecuteOutput(rawOutput) });
}

function invokeSync(portalId, request) {
  return invokeSyncWithAuth(portalId, request, GRANTED);
}

function invokeSyncUnauthorized(portalId, request) {
  return invokeSyncWithAuth(portalId, request, DENIED_AUTHORIZATION);
}

// A synchronous runner for an already-CONSTRUCTED OrchestrationPlan
// (see metaIntelligence.js's planForTask, itself synchronous) — for
// benchmark cases exercising real multi-capability composition without
// needing benchmark.js's accepted synchronous contract to change.
// Dependency ordering is NOT resolved here (unlike orchestrator.js's
// real executePlan) — every registered realm's execute() in this
// milestone is independent, so plans built for benchmarking never
// declare dependsOn; a plan that does should go through the real,
// async executePlan() instead.
function runPlanSync(plan, { authorization = GRANTED } = {}) {
  const { createRealmExecution } = require("./protocol");
  return plan.steps.map((step) => {
    const result = invokeSyncWithAuth(step.portalId, step.payload, authorization);
    return createRealmExecution({ planId: plan.id, stepId: step.stepId, portalId: step.portalId, realmId: result.realmId, status: result.status, input: step.payload, portalResult: result });
  });
}

// A synchronous re-implementation of a small, dependency-free
// (all-parallel) orchestration plan, mirroring orchestrator.js's real
// (async) executePlan() logic exactly for this simple case.
function runParallelPlan() {
  const plan = createOrchestrationPlan({
    task: "benchmark parallel composition",
    steps: [
      { stepId: "s1", portalId: "portal.mathematics", payload: { operation: "add", args: [2, 2] } },
      { stepId: "s2", portalId: "portal.mathematics", payload: { operation: "multiply", args: [3, 3] } },
    ],
  });
  return plan.steps.map((step) => {
    const result = invokeSync(step.portalId, step.payload);
    return createRealmExecution({ planId: plan.id, stepId: step.stepId, portalId: step.portalId, realmId: result.realmId, status: result.status, input: step.payload, portalResult: result });
  });
}

function validateAllRealms() {
  const problems = [];
  for (const realm of realmRegistry.list()) {
    const p = validateRealm(realm);
    if (p.length) problems.push({ realmId: realm.id, problems: p });
  }
  return problems;
}

module.exports = { invokeSync, invokeSyncUnauthorized, crossRealmVerify, runParallelPlan, runPlanSync, validateAllRealms };
