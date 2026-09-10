"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { sendRealmMessage, crossRealmVerify } = require("../universe/crossRealm");
const { realmRegistry, portalRegistry } = require("../universe/registry");
const { createRealm, createPortal } = require("../universe/domain");
const { createAuthorization, createRealmMessage, createPortalResult, PortalResultStatus } = require("../universe/protocol");
const { RealmStatus, PortalStatus, VerificationOutcome } = require("../shared/constants");

beforeEach(() => {
  realmRegistry._reset();
  portalRegistry._reset();
});

const auth = createAuthorization({ granted: true, level: "EXECUTE" });

test("sendRealmMessage: routes through the same portal invocation lifecycle as any other caller — no back door for a realm to reach another realm directly", async () => {
  realmRegistry.register(createRealm({ id: "realm.physics", name: "Physics", status: RealmStatus.IMPLEMENTED, execute: (input) => input.force / input.mass }));
  portalRegistry.register(createPortal({ id: "portal.physics", name: "Physics Portal", realmId: "realm.physics", status: PortalStatus.ACTIVE }));

  const message = createRealmMessage({
    sourceRealm: "realm.engineering",
    targetRealm: "realm.physics",
    targetPortal: "portal.physics",
    purpose: "compute acceleration",
    payload: { force: 10, mass: 2 },
    authorization: auth,
  });
  const { result } = await sendRealmMessage(message);
  assert.equal(result.status, PortalResultStatus.RESULT);
  assert.equal(result.result, 5);
  assert.equal(result.realmId, "realm.physics");
});

test("sendRealmMessage: an unauthorized message is refused exactly like a direct portal request would be", async () => {
  realmRegistry.register(createRealm({ id: "realm.physics", name: "Physics", status: RealmStatus.IMPLEMENTED, execute: () => 1 }));
  portalRegistry.register(createPortal({ id: "portal.physics", name: "Physics", realmId: "realm.physics", status: PortalStatus.ACTIVE }));

  const message = createRealmMessage({ sourceRealm: "a", targetRealm: "realm.physics", targetPortal: "portal.physics", purpose: "x", payload: {} });
  const { result } = await sendRealmMessage(message);
  assert.equal(result.status, PortalResultStatus.UNAUTHORIZED);
});

function fakeResult(realmId, result) {
  return createPortalResult({ requestId: "r", portalId: `portal.${realmId}`, realmId, status: PortalResultStatus.RESULT, result });
}

test("crossRealmVerify: two independently-produced agreeing results -> VERIFIED", () => {
  const vr = crossRealmVerify([fakeResult("realm.a", 42), fakeResult("realm.b", 42)]);
  assert.equal(vr.status, VerificationOutcome.VERIFIED);
  assert.equal(vr.sources.length, 2);
});

test("crossRealmVerify: two disagreeing results -> CONFLICTING_RESULTS, BOTH sources preserved, neither discarded", () => {
  const vr = crossRealmVerify([fakeResult("realm.a", 42), fakeResult("realm.b", 99)]);
  assert.equal(vr.status, VerificationOutcome.CONFLICTING_RESULTS);
  assert.equal(vr.sources.length, 2);
  assert.deepEqual(vr.sources.map((s) => s.result).sort(), [42, 99]);
});

test("crossRealmVerify: fewer than two successful results -> UNKNOWN, never a guess", () => {
  const onlyOne = crossRealmVerify([fakeResult("realm.a", 42)]);
  assert.equal(onlyOne.status, VerificationOutcome.UNKNOWN);

  const errored = createPortalResult({ requestId: "r", portalId: "portal.b", realmId: "realm.b", status: PortalResultStatus.ERROR });
  const oneOk = crossRealmVerify([fakeResult("realm.a", 42), errored]);
  assert.equal(oneOk.status, VerificationOutcome.UNKNOWN);
});

test("crossRealmVerify: empty input -> UNKNOWN with zero sources", () => {
  const vr = crossRealmVerify([]);
  assert.equal(vr.status, VerificationOutcome.UNKNOWN);
  assert.deepEqual(vr.sources, []);
});

test("crossRealmVerify: a custom compare function is honored instead of the default structural-equality check", () => {
  const vr = crossRealmVerify([fakeResult("realm.a", 10.001), fakeResult("realm.b", 10.002)], {
    compare: (a, b) => Math.abs(a - b) < 0.01,
  });
  assert.equal(vr.status, VerificationOutcome.VERIFIED);
});
