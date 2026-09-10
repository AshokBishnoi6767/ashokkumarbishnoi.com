"use strict";

const { test, before } = require("node:test");
const assert = require("node:assert/strict");

const { bootstrap } = require("../universe/bootstrap");
const {
  realmRegistry,
  portalRegistry,
  capabilityRegistry,
  commandCenterRegistry,
  botApplicationRegistry,
  validateRealm,
  validatePortal,
  validateBotApplication,
  resolveCommandCenterDependencies,
  findRealmsByStatus,
} = require("../universe/registry");
const { invokePortal } = require("../universe/portalInvoke");
const { handleCommandCenterRequest } = require("../universe/commandCenter");
const { createAuthorization, createPortalRequest, PortalResultStatus } = require("../universe/protocol");
const { RealmStatus } = require("../shared/constants");

before(() => {
  capabilityRegistry._reset();
  realmRegistry._reset();
  portalRegistry._reset();
  commandCenterRegistry._reset();
  botApplicationRegistry._reset();
  bootstrap();
});

const auth = createAuthorization({ granted: true, level: "EXECUTE" });

test("bootstrap: every registered realm validates clean — no dangling capability references, no unbacked status claims", () => {
  for (const realm of realmRegistry.list()) {
    assert.deepEqual(validateRealm(realm), [], `realm '${realm.id}' should validate clean`);
  }
});

test("bootstrap: every registered portal validates clean — no dangling realm references", () => {
  for (const portal of portalRegistry.list()) {
    assert.deepEqual(validatePortal(portal), [], `portal '${portal.id}' should validate clean`);
  }
});

test("bootstrap: every registered command center's realms/portals actually exist", () => {
  for (const cc of commandCenterRegistry.list()) {
    const result = resolveCommandCenterDependencies(cc.id);
    assert.equal(result.resolved, true, `command center '${cc.id}' has unresolved dependencies: ${JSON.stringify(result)}`);
  }
});

test("bootstrap: status is truthful — every IMPLEMENTED/VERIFIED realm has a real, callable execute function; every PLANNED realm has none", () => {
  const executable = [...findRealmsByStatus(RealmStatus.IMPLEMENTED), ...findRealmsByStatus(RealmStatus.VERIFIED)];
  assert.ok(executable.length >= 7, "at least the 7 real subsystems should be registered as IMPLEMENTED/VERIFIED");
  for (const realm of executable) {
    assert.equal(typeof realm.execute, "function", `'${realm.id}' claims ${realm.status} but has no execute function`);
  }
  const planned = findRealmsByStatus(RealmStatus.PLANNED);
  assert.ok(planned.length > 0, "at least one honest PLANNED placeholder should exist");
  for (const realm of planned) {
    assert.equal(realm.execute, null, `'${realm.id}' is PLANNED but has an execute function — status would be a lie`);
  }
});

test("bootstrap: Mathematics portal executes real arithmetic through the actual math/engine.js, not a stub", async () => {
  const res = await invokePortal(createPortalRequest({ portalId: "portal.mathematics", request: { operation: "multiply", args: [12, 17] }, authorization: auth }));
  assert.equal(res.status, PortalResultStatus.RESULT);
  assert.equal(res.result, 204);
});

test("bootstrap: Language portal executes the real Symbol->Knowledge chain, not a stub", async () => {
  const res = await invokePortal(createPortalRequest({ portalId: "portal.language", request: { text: "Dog bites man." }, authorization: auth }));
  assert.equal(res.status, PortalResultStatus.RESULT);
  assert.equal(res.result.length, 1);
  assert.equal(res.result[0].predicate, "BITES");
});

test("bootstrap: Reasoning portal detects a real polarity contradiction via checkConsistency, not a stub", async () => {
  const john = { id: "e-john", surface: "John" };
  const toronto = { id: "e-toronto", surface: "Toronto" };
  const positive = { id: "k-1", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE" };
  const negative = { id: "k-2", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE" };
  const res = await invokePortal(
    createPortalRequest({ portalId: "portal.reasoning", request: { mode: "checkConsistency", records: [positive, negative] }, authorization: auth })
  );
  assert.equal(res.status, PortalResultStatus.RESULT);
  assert.equal(res.result.length, 1);
  assert.equal(res.result[0].type, "POLARITY_CONTRADICTION");
});

test("bootstrap: Verification portal returns UNKNOWN (never fabricated VERIFIED) for a claim with zero evidence", async () => {
  const res = await invokePortal(createPortalRequest({ portalId: "portal.verification", request: { claim: { id: "claim-x" } }, authorization: auth }));
  assert.equal(res.status, PortalResultStatus.RESULT);
  assert.equal(res.result, "UNKNOWN");
});

test("bootstrap: Policy portal returns UNKNOWN when a required fact is missing, never a guessed eligibility", async () => {
  const policy = { id: "p1", conditions: [{ field: "purchase_age_days", operator: "LTE", value: 30 }] };
  const res = await invokePortal(createPortalRequest({ portalId: "portal.policy", request: { policy, facts: {} }, authorization: auth }));
  assert.equal(res.result, "UNKNOWN");
});

test("bootstrap: PLANNED realms (Physics, Coding, Multimodal, Research, Customer Intelligence, Biology) all honestly report NOT_IMPLEMENTED, never a fabricated answer", async () => {
  const plannedPortalIds = ["portal.physics", "portal.coding", "portal.multimodal", "portal.research", "portal.customer", "portal.biology"];
  for (const portalId of plannedPortalIds) {
    const res = await invokePortal(createPortalRequest({ portalId, request: {}, authorization: auth }));
    assert.equal(res.status, PortalResultStatus.NOT_IMPLEMENTED, `${portalId} should be NOT_IMPLEMENTED`);
  }
});

test("bootstrap: cross-realm — Mathematics computes, Verification independently re-derives and confirms, through two distinct portals", async () => {
  const mathRes = await invokePortal(createPortalRequest({ portalId: "portal.mathematics", request: { operation: "add", args: [2, 2] }, authorization: auth }));
  assert.equal(mathRes.result, 4);

  const math = require("../math/engine");
  // verifyClaim needs an independentChecks array to actually confirm;
  // wire a real independent recomputation through the SAME math engine
  // the claim came from, exactly the pattern verifyMathClaim uses.
  const verifyResWithCheck = await invokePortal(
    createPortalRequest({
      portalId: "portal.verification",
      request: {
        claim: { id: "claim-math" },
        options: { independentChecks: [{ name: "recompute", check: () => math.add(2, 2).output === 4 }] },
      },
      authorization: auth,
    })
  );
  assert.equal(verifyResWithCheck.result, "VERIFIED");
});

test("bootstrap: both registered bot applications validate clean — every portal they list is real and registered", () => {
  assert.equal(botApplicationRegistry.count(), 2);
  for (const bot of botApplicationRegistry.list()) {
    assert.deepEqual(validateBotApplication(bot), [], `bot '${bot.id}' should validate clean`);
  }
});

test("bootstrap: end-to-end Command Center request — Intelligence Core CC handles a real math capability request with no escalation", async () => {
  const res = await handleCommandCenterRequest("cc.intelligence_core", {
    task: "compute 12 x 17",
    requiredCapabilities: ["cap.exact_computation"],
    payloadFor: () => ({ operation: "multiply", args: [12, 17] }),
    authorization: auth,
  });
  assert.equal(res.status, "HANDLED");
  assert.equal(res.executions[0].portalResult.result, 204);
  assert.equal(res.escalation, null);
});

test("bootstrap: Command Center escalation is real — Customer Intelligence CC cannot serve a mathematics capability from its own scope", async () => {
  const res = await handleCommandCenterRequest("cc.customer_intelligence", {
    task: "needs math, wrong command center",
    requiredCapabilities: ["cap.exact_computation"],
    authorization: auth,
  });
  assert.ok(res.escalation);
  assert.equal(res.escalation.unresolvedCapabilities[0].capabilityId, "cap.exact_computation");
});
