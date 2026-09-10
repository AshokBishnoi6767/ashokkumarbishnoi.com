"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { handleCommandCenterRequest } = require("../universe/commandCenter");
const { capabilityRegistry, realmRegistry, portalRegistry, commandCenterRegistry } = require("../universe/registry");
const { createCapability, createRealm, createPortal, createCommandCenter } = require("../universe/domain");
const { createAuthorization, PortalResultStatus } = require("../universe/protocol");
const { RealmStatus, PortalStatus } = require("../shared/constants");

beforeEach(() => {
  capabilityRegistry._reset();
  realmRegistry._reset();
  portalRegistry._reset();
  commandCenterRegistry._reset();

  capabilityRegistry.register(createCapability({ id: "cap.a", name: "A", domain: "test" }));
  realmRegistry.register(createRealm({ id: "realm.a", name: "A", capabilities: ["cap.a"], status: RealmStatus.IMPLEMENTED, execute: (input) => input.x * 2 }));
  portalRegistry.register(createPortal({ id: "portal.a", name: "A Portal", realmId: "realm.a", status: PortalStatus.ACTIVE }));

  commandCenterRegistry.register(createCommandCenter({ id: "cc.home", name: "Home CC", realmIds: ["realm.a"], portalIds: ["portal.a"] }));
  commandCenterRegistry.register(createCommandCenter({ id: "cc.empty", name: "Empty CC", realmIds: [], portalIds: [] }));
});

const auth = createAuthorization({ granted: true, level: "EXECUTE" });

test("handleCommandCenterRequest: an unregistered command center id returns ERROR, never a fabricated handling", async () => {
  const res = await handleCommandCenterRequest("cc.nonexistent", { task: "x", requiredCapabilities: ["cap.a"], authorization: auth });
  assert.equal(res.status, "ERROR");
  assert.equal(res.plan, null);
});

test("handleCommandCenterRequest: a capability servable within this command center executes for real, no escalation", async () => {
  const res = await handleCommandCenterRequest("cc.home", {
    task: "double a number",
    requiredCapabilities: ["cap.a"],
    payloadFor: () => ({ x: 21 }),
    authorization: auth,
  });
  assert.equal(res.status, "HANDLED");
  assert.equal(res.executions.length, 1);
  assert.equal(res.executions[0].portalResult.result, 42);
  assert.equal(res.executions[0].status, PortalResultStatus.RESULT);
  assert.equal(res.escalation, null);
});

test("handleCommandCenterRequest: a capability whose ONLY portal exists OUTSIDE this command center's scope is escalated, never silently reached for", async () => {
  const res = await handleCommandCenterRequest("cc.empty", { task: "needs A", requiredCapabilities: ["cap.a"], authorization: auth });
  assert.equal(res.status, "HANDLED");
  assert.equal(res.executions.length, 0);
  assert.ok(res.escalation);
  assert.equal(res.escalation.unresolvedCapabilities.length, 1);
  assert.equal(res.escalation.unresolvedCapabilities[0].capabilityId, "cap.a");
});

test("handleCommandCenterRequest: escalation reason distinguishes 'no portal in scope' from 'ambiguous in scope'", async () => {
  realmRegistry.register(createRealm({ id: "realm.a2", name: "A2", capabilities: ["cap.a"], status: RealmStatus.IMPLEMENTED, execute: () => 1 }));
  portalRegistry.register(createPortal({ id: "portal.a2", name: "A2 Portal", realmId: "realm.a2", status: PortalStatus.ACTIVE }));
  commandCenterRegistry.register(createCommandCenter({ id: "cc.ambiguous", name: "Ambiguous CC", realmIds: ["realm.a", "realm.a2"], portalIds: ["portal.a", "portal.a2"] }));

  const res = await handleCommandCenterRequest("cc.ambiguous", { task: "needs A", requiredCapabilities: ["cap.a"], authorization: auth });
  assert.ok(res.escalation);
  assert.equal(res.escalation.ambiguousCapabilities.length, 1);
  assert.ok(res.escalation.reason.includes("ambiguous"));
});

test("handleCommandCenterRequest: unauthorized requests still propagate UNAUTHORIZED per execution, never silently skipped", async () => {
  const res = await handleCommandCenterRequest("cc.home", { task: "double", requiredCapabilities: ["cap.a"], payloadFor: () => ({ x: 1 }) });
  assert.equal(res.executions[0].status, PortalResultStatus.UNAUTHORIZED);
});
