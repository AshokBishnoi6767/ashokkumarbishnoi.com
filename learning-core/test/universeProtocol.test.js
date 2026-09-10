"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  createAuthorization,
  DENIED_AUTHORIZATION,
  createPortalRequest,
  createPortalResult,
  createRealmMessage,
  createCrossRealmRequest,
  createOrchestrationPlan,
  createRealmExecution,
  createVerificationResult,
  PortalResultStatus,
} = require("../universe/protocol");
const { TruthState, ProbabilityStatus, UncertaintyStatus } = require("../shared/constants");

test("createAuthorization: requires an explicit boolean 'granted' — authorization is never assumed", () => {
  assert.throws(() => createAuthorization({}), TypeError);
  assert.throws(() => createAuthorization({ granted: "yes" }), TypeError);
  const auth = createAuthorization({ granted: true, level: "EXECUTE" });
  assert.equal(auth.granted, true);
});

test("DENIED_AUTHORIZATION is the honest default a request carries when the caller supplies none", () => {
  assert.equal(DENIED_AUTHORIZATION.granted, false);
});

test("createPortalRequest: default authorization is denied, never silently granted", () => {
  const req = createPortalRequest({ portalId: "portal.x", request: {} });
  assert.equal(req.authorization.granted, false);
});

test("createPortalResult: epistemic fields default to the honest 'nothing known yet' state, never upgraded", () => {
  const res = createPortalResult({ requestId: "req-1", portalId: "portal.x", realmId: "realm.x", status: PortalResultStatus.RESULT });
  assert.equal(res.truth_state, TruthState.UNKNOWN);
  assert.equal(res.confidence, null);
  assert.equal(res.probability, ProbabilityStatus.NOT_DEFINED);
  assert.equal(res.uncertainty, UncertaintyStatus.PRESENT);
});

test("createPortalResult: rejects an unrecognized status", () => {
  assert.throws(() => createPortalResult({ requestId: "r", portalId: "p", realmId: "x", status: "MADE_UP" }), TypeError);
});

test("createRealmMessage: requires source/target realm, target portal, and purpose — never an implicit direct mutation", () => {
  assert.throws(() => createRealmMessage({ targetRealm: "b", targetPortal: "p", purpose: "x" }), TypeError);
  const msg = createRealmMessage({ sourceRealm: "a", targetRealm: "b", targetPortal: "portal.b", purpose: "compute" });
  assert.equal(msg.sourceRealm, "a");
  assert.equal(msg.targetRealm, "b");
});

test("createCrossRealmRequest: requires at least one target portal", () => {
  assert.throws(() => createCrossRealmRequest({ targetPortalIds: [], purpose: "x" }), TypeError);
  const req = createCrossRealmRequest({ targetPortalIds: ["portal.a", "portal.b"], purpose: "compare" });
  assert.equal(req.targetPortalIds.length, 2);
});

test("createOrchestrationPlan: every step and dependency edge is explicit data, inspectable without executing anything", () => {
  const plan = createOrchestrationPlan({
    task: "design",
    steps: [
      { stepId: "s1", portalId: "portal.math" },
      { stepId: "s2", portalId: "portal.physics", dependsOn: ["s1"] },
    ],
  });
  assert.equal(plan.steps.length, 2);
  assert.deepEqual(plan.steps[1].dependsOn, ["s1"]);
  assert.ok(Object.isFrozen(plan.steps[0]));
});

test("createRealmExecution: requires plan/step/portal/realm identity — every execution is traceable back to its plan", () => {
  assert.throws(() => createRealmExecution({ stepId: "s1", portalId: "p", realmId: "r", status: "RESULT" }), TypeError);
  const exec = createRealmExecution({ planId: "plan-1", stepId: "s1", portalId: "portal.x", realmId: "realm.x", status: "RESULT" });
  assert.equal(exec.planId, "plan-1");
});

test("createVerificationResult: rejects an unrecognized status; sources array preserved without alteration", () => {
  assert.throws(() => createVerificationResult({ status: "MADE_UP" }), TypeError);
  const vr = createVerificationResult({ status: "CONFLICTING_RESULTS", sources: [{ realmId: "a" }, { realmId: "b" }] });
  assert.equal(vr.sources.length, 2);
});
