"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { createCapability, createRealm, createPortal, createCommandCenter, createBotApplication } = require("../universe/domain");
const { RealmStatus, PortalStatus } = require("../shared/constants");

test("createCapability: rejects missing required fields", () => {
  assert.throws(() => createCapability({ name: "x", domain: "y" }), TypeError);
  assert.throws(() => createCapability({ id: "x", domain: "y" }), TypeError);
  assert.throws(() => createCapability({ id: "x", name: "y" }), TypeError);
});

test("createCapability: honest defaults, frozen result", () => {
  const cap = createCapability({ id: "cap.x", name: "X", domain: "math" });
  assert.deepEqual(cap.operators, []);
  assert.equal(cap.verification, null);
  assert.ok(Object.isFrozen(cap));
});

test("createRealm: defaults to PLANNED status and no execute function", () => {
  const realm = createRealm({ id: "realm.x", name: "X" });
  assert.equal(realm.status, RealmStatus.PLANNED);
  assert.equal(realm.execute, null);
});

test("createRealm: rejects an executable status (EXPERIMENTAL/IMPLEMENTED/VERIFIED/PRODUCTION_READY) with no execute function — catches fake implementation status at construction time", () => {
  assert.throws(() => createRealm({ id: "realm.x", name: "X", status: RealmStatus.EXPERIMENTAL }), TypeError);
  assert.throws(() => createRealm({ id: "realm.x", name: "X", status: RealmStatus.IMPLEMENTED }), TypeError);
  assert.throws(() => createRealm({ id: "realm.x", name: "X", status: RealmStatus.VERIFIED }), TypeError);
  assert.throws(() => createRealm({ id: "realm.x", name: "X", status: RealmStatus.PRODUCTION_READY }), TypeError);
});

test("createRealm: PLANNED/SCAFFOLDED never require an execute function — no busywork stub needed for a not-yet-built realm", () => {
  assert.doesNotThrow(() => createRealm({ id: "realm.a", name: "A", status: RealmStatus.PLANNED }));
  assert.doesNotThrow(() => createRealm({ id: "realm.b", name: "B", status: RealmStatus.SCAFFOLDED }));
});

test("createRealm: an executable status WITH a real execute function is accepted", () => {
  const realm = createRealm({ id: "realm.x", name: "X", status: RealmStatus.IMPLEMENTED, execute: () => 1 });
  assert.equal(typeof realm.execute, "function");
});

test("createRealm: rejects an invalid status value rather than silently accepting it", () => {
  assert.throws(() => createRealm({ id: "realm.x", name: "X", status: "MADE_UP_STATUS" }), TypeError);
});

test("createPortal: requires id/name/realmId, defaults to PLANNED status", () => {
  assert.throws(() => createPortal({ name: "X", realmId: "realm.x" }), TypeError);
  assert.throws(() => createPortal({ id: "portal.x", realmId: "realm.x" }), TypeError);
  assert.throws(() => createPortal({ id: "portal.x", name: "X" }), TypeError);
  const portal = createPortal({ id: "portal.x", name: "X", realmId: "realm.x" });
  assert.equal(portal.status, PortalStatus.PLANNED);
});

test("createCommandCenter: honest empty defaults, never invents realm/portal membership", () => {
  const cc = createCommandCenter({ id: "cc.x", name: "X" });
  assert.deepEqual(cc.realmIds, []);
  assert.deepEqual(cc.portalIds, []);
});

test("createBotApplication: requires id/name, supports zero or many portals", () => {
  assert.throws(() => createBotApplication({ name: "X" }), TypeError);
  const bot = createBotApplication({ id: "bot.x", name: "X", portals: ["portal.a", "portal.b"] });
  assert.deepEqual(bot.portals, ["portal.a", "portal.b"]);
});
