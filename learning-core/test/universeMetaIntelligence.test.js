"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { discoverForCapability, planForTask } = require("../universe/metaIntelligence");
const { capabilityRegistry, realmRegistry, portalRegistry } = require("../universe/registry");
const { createCapability, createRealm, createPortal } = require("../universe/domain");
const { RealmStatus, PortalStatus } = require("../shared/constants");

beforeEach(() => {
  capabilityRegistry._reset();
  realmRegistry._reset();
  portalRegistry._reset();

  capabilityRegistry.register(createCapability({ id: "cap.a", name: "A", domain: "test" }));
  capabilityRegistry.register(createCapability({ id: "cap.b", name: "B", domain: "test" }));

  realmRegistry.register(createRealm({ id: "realm.a", name: "A", capabilities: ["cap.a"], status: RealmStatus.IMPLEMENTED, execute: (input) => input.x }));
  portalRegistry.register(createPortal({ id: "portal.a", name: "A Portal", realmId: "realm.a", status: PortalStatus.ACTIVE }));

  realmRegistry.register(createRealm({ id: "realm.b", name: "B", capabilities: ["cap.b"], status: RealmStatus.IMPLEMENTED, execute: (input) => input.y }));
  portalRegistry.register(createPortal({ id: "portal.b", name: "B Portal", realmId: "realm.b", status: PortalStatus.ACTIVE }));
});

test("discoverForCapability: finds the realm/portal actually backing a capability, discovery only", () => {
  const { realms, portals } = discoverForCapability("cap.a");
  assert.deepEqual(realms.map((r) => r.id), ["realm.a"]);
  assert.deepEqual(portals.map((p) => p.id), ["portal.a"]);
});

test("discoverForCapability: a capability with no registered realm returns empty, never fabricated", () => {
  const { realms, portals } = discoverForCapability("cap.nonexistent");
  assert.deepEqual(realms, []);
  assert.deepEqual(portals, []);
});

test("discoverForCapability: a realm registered but its portal not ACTIVE is excluded — capability appears unresolved, not falsely available", () => {
  realmRegistry.register(createRealm({ id: "realm.c", name: "C", capabilities: ["cap.c"], status: RealmStatus.PLANNED }));
  capabilityRegistry.register(createCapability({ id: "cap.c", name: "C", domain: "test" }));
  portalRegistry.register(createPortal({ id: "portal.c", name: "C Portal", realmId: "realm.c", status: PortalStatus.PLANNED }));
  const { portals } = discoverForCapability("cap.c");
  assert.deepEqual(portals, []);
});

test("planForTask: rejects an empty task description or empty capability list — this module never infers what a task needs", () => {
  assert.throws(() => planForTask({ task: "", requiredCapabilities: ["cap.a"] }), TypeError);
  assert.throws(() => planForTask({ task: "x", requiredCapabilities: [] }), TypeError);
});

test("planForTask: a single resolvable capability produces a 1-step plan naming the correct portal", () => {
  const { plan, resolution, unresolvedCapabilities, ambiguousCapabilities } = planForTask({ task: "do A", requiredCapabilities: ["cap.a"] });
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].portalId, "portal.a");
  assert.deepEqual(resolution, [{ capabilityId: "cap.a", portalId: "portal.a", realmId: "realm.a" }]);
  assert.deepEqual(unresolvedCapabilities, []);
  assert.deepEqual(ambiguousCapabilities, []);
});

test("planForTask: multiple capabilities produce multiple independent steps, each correctly attributed", () => {
  const { plan, resolution } = planForTask({ task: "do A and B", requiredCapabilities: ["cap.a", "cap.b"] });
  assert.equal(plan.steps.length, 2);
  assert.deepEqual(resolution.map((r) => r.portalId).sort(), ["portal.a", "portal.b"]);
});

test("planForTask: payloadFor supplies each step's actual request payload, per capability", () => {
  const { plan } = planForTask({
    task: "do A and B",
    requiredCapabilities: ["cap.a", "cap.b"],
    payloadFor: (capId) => ({ capId }),
  });
  const byPortal = Object.fromEntries(plan.steps.map((s) => [s.portalId, s.payload]));
  assert.deepEqual(byPortal["portal.a"], { capId: "cap.a" });
  assert.deepEqual(byPortal["portal.b"], { capId: "cap.b" });
});

test("planForTask: an unresolvable capability is reported, never silently dropped or given a fabricated step", () => {
  const { plan, unresolvedCapabilities } = planForTask({ task: "do A and Z", requiredCapabilities: ["cap.a", "cap.nonexistent"] });
  assert.equal(plan.steps.length, 1);
  assert.equal(unresolvedCapabilities.length, 1);
  assert.equal(unresolvedCapabilities[0].capabilityId, "cap.nonexistent");
});

test("planForTask: every capability unresolvable -> plan is null, never an empty-but-truthy plan", () => {
  const { plan, unresolvedCapabilities } = planForTask({ task: "do Z", requiredCapabilities: ["cap.nonexistent"] });
  assert.equal(plan, null);
  assert.equal(unresolvedCapabilities.length, 1);
});

test("planForTask: two ACTIVE portals serving the SAME capability is reported ambiguous, never a silent pick", () => {
  realmRegistry.register(createRealm({ id: "realm.a2", name: "A2", capabilities: ["cap.a"], status: RealmStatus.IMPLEMENTED, execute: () => 1 }));
  portalRegistry.register(createPortal({ id: "portal.a2", name: "A2 Portal", realmId: "realm.a2", status: PortalStatus.ACTIVE }));

  const { plan, ambiguousCapabilities } = planForTask({ task: "do A", requiredCapabilities: ["cap.a"] });
  assert.equal(plan, null);
  assert.equal(ambiguousCapabilities.length, 1);
  assert.deepEqual(ambiguousCapabilities[0].candidatePortalIds.sort(), ["portal.a", "portal.a2"]);
});

test("planForTask: portalIds scoping restricts discovery to only the named portals — the mechanism commandCenter.js uses to stay within its own boundary", () => {
  const { plan, unresolvedCapabilities } = planForTask({ task: "do A", requiredCapabilities: ["cap.a"], portalIds: ["portal.b"] });
  assert.equal(plan, null);
  assert.equal(unresolvedCapabilities.length, 1);
  assert.equal(unresolvedCapabilities[0].capabilityId, "cap.a");
});
