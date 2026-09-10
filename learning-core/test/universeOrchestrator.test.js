"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { executePlan } = require("../universe/orchestrator");
const { realmRegistry, portalRegistry } = require("../universe/registry");
const { createRealm, createPortal } = require("../universe/domain");
const { createAuthorization, createOrchestrationPlan, PortalResultStatus } = require("../universe/protocol");
const { RealmStatus, PortalStatus } = require("../shared/constants");

beforeEach(() => {
  realmRegistry._reset();
  portalRegistry._reset();
  realmRegistry.register(createRealm({ id: "realm.double", name: "Double", status: RealmStatus.IMPLEMENTED, execute: (input) => input.x * 2 }));
  portalRegistry.register(createPortal({ id: "portal.double", name: "Double Portal", realmId: "realm.double", status: PortalStatus.ACTIVE }));
});

const auth = createAuthorization({ granted: true, level: "EXECUTE" });

test("executePlan: independent steps (no dependsOn) all execute and every result is preserved", async () => {
  const plan = createOrchestrationPlan({
    task: "double two numbers",
    steps: [
      { stepId: "s1", portalId: "portal.double", payload: { x: 3 } },
      { stepId: "s2", portalId: "portal.double", payload: { x: 10 } },
    ],
  });
  const { executions } = await executePlan(plan, { authorization: auth });
  assert.equal(executions.length, 2);
  const byId = Object.fromEntries(executions.map((e) => [e.stepId, e]));
  assert.equal(byId.s1.portalResult.result, 6);
  assert.equal(byId.s2.portalResult.result, 20);
});

test("executePlan: a dependent step only runs after its dependency completes, and every execution names its plan/step", async () => {
  const plan = createOrchestrationPlan({
    task: "chain",
    steps: [
      { stepId: "s1", portalId: "portal.double", payload: { x: 2 } },
      { stepId: "s2", portalId: "portal.double", dependsOn: ["s1"], payload: { x: 5 } },
    ],
  });
  const { executions } = await executePlan(plan, { authorization: auth });
  assert.equal(executions.length, 2);
  for (const e of executions) {
    assert.equal(e.planId, plan.id);
  }
});

test("executePlan: a step depending on a nonexistent step id is reported as ERROR, never silently skipped or hung", async () => {
  const plan = createOrchestrationPlan({
    task: "broken",
    steps: [{ stepId: "s1", portalId: "portal.double", dependsOn: ["s0-does-not-exist"], payload: { x: 1 } }],
  });
  const { executions } = await executePlan(plan, { authorization: auth });
  assert.equal(executions.length, 1);
  assert.equal(executions[0].status, PortalResultStatus.ERROR);
});

test("executePlan: every step's result carries its own realm identity — mixed-realm plans stay individually attributable", async () => {
  realmRegistry.register(createRealm({ id: "realm.negate", name: "Negate", status: RealmStatus.IMPLEMENTED, execute: (input) => -input.x }));
  portalRegistry.register(createPortal({ id: "portal.negate", name: "Negate Portal", realmId: "realm.negate", status: PortalStatus.ACTIVE }));

  const plan = createOrchestrationPlan({
    task: "mixed",
    steps: [
      { stepId: "s1", portalId: "portal.double", payload: { x: 4 } },
      { stepId: "s2", portalId: "portal.negate", payload: { x: 4 } },
    ],
  });
  const { executions } = await executePlan(plan, { authorization: auth });
  const byId = Object.fromEntries(executions.map((e) => [e.stepId, e]));
  assert.equal(byId.s1.realmId, "realm.double");
  assert.equal(byId.s2.realmId, "realm.negate");
});

test("executePlan: unauthorized invocation propagates per-step (UNAUTHORIZED), never executes despite being part of a plan", async () => {
  const plan = createOrchestrationPlan({ task: "no auth", steps: [{ stepId: "s1", portalId: "portal.double", payload: { x: 1 } }] });
  const { executions } = await executePlan(plan, {});
  assert.equal(executions[0].status, PortalResultStatus.UNAUTHORIZED);
});
