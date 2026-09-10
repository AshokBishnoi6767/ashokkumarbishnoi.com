"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  capabilityRegistry,
  realmRegistry,
  portalRegistry,
  commandCenterRegistry,
  findRealmsByCategory,
  findRealmsByCapability,
  findRealmsByStatus,
  validateRealm,
  findPortalsByRealm,
  findPortalByName,
  validatePortal,
  resolveCommandCenterDependencies,
} = require("../universe/registry");
const { createCapability, createRealm, createPortal, createCommandCenter } = require("../universe/domain");
const { RealmStatus, PortalStatus } = require("../shared/constants");

beforeEach(() => {
  capabilityRegistry._reset();
  realmRegistry._reset();
  portalRegistry._reset();
  commandCenterRegistry._reset();
});

test("registry: register/get/list/has/count all work, discovery only — nothing executes on registration", () => {
  const cap = createCapability({ id: "cap.a", name: "A", domain: "math" });
  capabilityRegistry.register(cap);
  assert.equal(capabilityRegistry.get("cap.a"), cap);
  assert.equal(capabilityRegistry.has("cap.a"), true);
  assert.equal(capabilityRegistry.count(), 1);
  assert.deepEqual(capabilityRegistry.list(), [cap]);
  assert.equal(capabilityRegistry.get("cap.nonexistent"), null);
});

test("registry: registering a duplicate id is rejected — ids are stable and unique, never silently overwritten", () => {
  const realm = createRealm({ id: "realm.a", name: "A" });
  realmRegistry.register(realm);
  assert.throws(() => realmRegistry.register(createRealm({ id: "realm.a", name: "A duplicate" })), Error);
});

test("findRealmsByCategory / findRealmsByCapability / findRealmsByStatus", () => {
  realmRegistry.register(createRealm({ id: "realm.a", name: "A", category: "STEM", capabilities: ["cap.x"], status: RealmStatus.PLANNED }));
  realmRegistry.register(createRealm({ id: "realm.b", name: "B", category: "STEM", capabilities: [], status: RealmStatus.SCAFFOLDED }));
  realmRegistry.register(createRealm({ id: "realm.c", name: "C", category: "OTHER", capabilities: ["cap.x"], status: RealmStatus.PLANNED }));

  assert.deepEqual(findRealmsByCategory("STEM").map((r) => r.id).sort(), ["realm.a", "realm.b"]);
  assert.deepEqual(findRealmsByCapability("cap.x").map((r) => r.id).sort(), ["realm.a", "realm.c"]);
  assert.deepEqual(findRealmsByStatus(RealmStatus.SCAFFOLDED).map((r) => r.id), ["realm.b"]);
});

test("validateRealm: catches a capability reference to an unregistered capability", () => {
  const realm = createRealm({ id: "realm.a", name: "A", capabilities: ["cap.missing"] });
  const problems = validateRealm(realm);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("cap.missing"));
});

test("validateRealm: VERIFIED status with zero benchmarks is flagged — a status claim must be backed by evidence", () => {
  const realm = createRealm({ id: "realm.a", name: "A", status: RealmStatus.VERIFIED, execute: () => 1, benchmarks: [] });
  const problems = validateRealm(realm);
  assert.ok(problems.some((p) => p.includes("VERIFIED")));
});

test("validateRealm: a well-formed IMPLEMENTED realm with registered capabilities validates clean", () => {
  capabilityRegistry.register(createCapability({ id: "cap.x", name: "X", domain: "math" }));
  const realm = createRealm({ id: "realm.a", name: "A", status: RealmStatus.IMPLEMENTED, execute: () => 1, capabilities: ["cap.x"] });
  assert.deepEqual(validateRealm(realm), []);
});

test("findPortalsByRealm / findPortalByName", () => {
  portalRegistry.register(createPortal({ id: "portal.a", name: "Alpha", realmId: "realm.x" }));
  portalRegistry.register(createPortal({ id: "portal.b", name: "Beta", realmId: "realm.x" }));
  portalRegistry.register(createPortal({ id: "portal.c", name: "Gamma", realmId: "realm.y" }));

  assert.deepEqual(findPortalsByRealm("realm.x").map((p) => p.id).sort(), ["portal.a", "portal.b"]);
  assert.equal(findPortalByName("Beta").id, "portal.b");
  assert.equal(findPortalByName("Nonexistent"), null);
});

test("validatePortal: catches a portal referencing an unregistered realm", () => {
  const portal = createPortal({ id: "portal.a", name: "A", realmId: "realm.missing" });
  const problems = validatePortal(portal);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("realm.missing"));
});

test("resolveCommandCenterDependencies: reports missing realms/portals rather than pretending they resolve", () => {
  commandCenterRegistry.register(createCommandCenter({ id: "cc.a", name: "A", realmIds: ["realm.x"], portalIds: ["portal.x"] }));
  const before = resolveCommandCenterDependencies("cc.a");
  assert.equal(before.resolved, false);
  assert.deepEqual(before.missingRealms, ["realm.x"]);
  assert.deepEqual(before.missingPortals, ["portal.x"]);

  realmRegistry.register(createRealm({ id: "realm.x", name: "X" }));
  portalRegistry.register(createPortal({ id: "portal.x", name: "X", realmId: "realm.x" }));
  const after = resolveCommandCenterDependencies("cc.a");
  assert.equal(after.resolved, true);
});

test("resolveCommandCenterDependencies: an unregistered command center id is reported unresolved, never a throw or a fabricated result", () => {
  const result = resolveCommandCenterDependencies("cc.nonexistent");
  assert.equal(result.resolved, false);
});
