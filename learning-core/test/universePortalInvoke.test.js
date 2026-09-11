"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  invokePortal,
  _setMaxConcurrentPortalExecutionsForTesting,
  _resetMaxConcurrentPortalExecutionsForTesting,
} = require("../universe/portalInvoke");
const { realmRegistry, portalRegistry } = require("../universe/registry");
const { createRealm, createPortal } = require("../universe/domain");
const { createAuthorization, createPortalRequest, PortalResultStatus } = require("../universe/protocol");
const { RealmStatus, PortalStatus, TruthState, UncertaintyStatus } = require("../shared/constants");

beforeEach(() => {
  realmRegistry._reset();
  portalRegistry._reset();
});

const grantedAuth = createAuthorization({ granted: true, level: "EXECUTE" });

function registerEchoRealmAndPortal({ realmStatus = RealmStatus.IMPLEMENTED, portalStatus = PortalStatus.ACTIVE, execute = (input) => input } = {}) {
  realmRegistry.register(createRealm({ id: "realm.echo", name: "Echo", status: realmStatus, execute: realmStatus === RealmStatus.IMPLEMENTED ? execute : null }));
  portalRegistry.register(createPortal({ id: "portal.echo", name: "Echo Portal", realmId: "realm.echo", status: portalStatus }));
}

test("invokePortal: an unresolvable portal id returns ERROR, never a crash or a fabricated result", async () => {
  const res = await invokePortal(createPortalRequest({ portalId: "portal.nonexistent", request: {}, authorization: grantedAuth }));
  assert.equal(res.status, PortalResultStatus.ERROR);
  assert.ok(res.reason.includes("portal.nonexistent"));
});

test("invokePortal: a non-ACTIVE portal (PLANNED/DISABLED) returns NOT_IMPLEMENTED, never executes anything", async () => {
  registerEchoRealmAndPortal({ portalStatus: PortalStatus.PLANNED });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
  assert.equal(res.status, PortalResultStatus.NOT_IMPLEMENTED);
});

test("invokePortal: missing/denied authorization returns UNAUTHORIZED BEFORE execution — the realm's execute function is never called", async () => {
  let called = false;
  registerEchoRealmAndPortal({ execute: () => { called = true; return 1; } });

  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {} }));
  assert.equal(res.status, PortalResultStatus.UNAUTHORIZED);
  assert.equal(called, false);
});

test("invokePortal: a portal-level required authorization LEVEL is enforced beyond mere 'granted'", async () => {
  realmRegistry.register(createRealm({ id: "realm.echo", name: "Echo", status: RealmStatus.IMPLEMENTED, execute: () => 1 }));
  portalRegistry.register(createPortal({ id: "portal.echo", name: "Echo", realmId: "realm.echo", status: PortalStatus.ACTIVE, authorizationPolicy: { requiredLevel: "EXECUTE" } }));

  const readOnlyAuth = createAuthorization({ granted: true, level: "READ" });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: readOnlyAuth }));
  assert.equal(res.status, PortalResultStatus.UNAUTHORIZED);

  const properAuth = createAuthorization({ granted: true, level: "EXECUTE" });
  const res2 = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: properAuth }));
  assert.equal(res2.status, PortalResultStatus.RESULT);
});

test("invokePortal: a PLANNED/SCAFFOLDED realm (no execute function) returns NOT_IMPLEMENTED honestly, even with full authorization", async () => {
  registerEchoRealmAndPortal({ realmStatus: RealmStatus.SCAFFOLDED });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
  assert.equal(res.status, PortalResultStatus.NOT_IMPLEMENTED);
  assert.equal(res.result, null);
});

test("invokePortal: EXPERIMENTAL realms DO execute (a real, if unbenchmarked, execution path) — distinct from SCAFFOLDED, which never does", async () => {
  realmRegistry.register(createRealm({ id: "realm.echo", name: "Echo", status: RealmStatus.EXPERIMENTAL, execute: () => 7 }));
  portalRegistry.register(createPortal({ id: "portal.echo", name: "Echo Portal", realmId: "realm.echo", status: PortalStatus.ACTIVE }));
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
  assert.equal(res.status, PortalResultStatus.RESULT);
  assert.equal(res.result, 7);
});

test("invokePortal: a real IMPLEMENTED realm executes and returns a bare value with honest default epistemic fields", async () => {
  registerEchoRealmAndPortal({ execute: () => 42 });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
  assert.equal(res.status, PortalResultStatus.RESULT);
  assert.equal(res.result, 42);
  assert.equal(res.truth_state, TruthState.UNKNOWN);
  assert.equal(res.uncertainty, UncertaintyStatus.PRESENT);
});

test("invokePortal: an execute() returning a structured object with explicit epistemic fields overrides only what it actually supplies", async () => {
  registerEchoRealmAndPortal({ execute: () => ({ result: 4, truth_state: "KNOWN", uncertainty: "ABSENT" }) });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
  assert.equal(res.result, 4);
  assert.equal(res.truth_state, "KNOWN");
  assert.equal(res.uncertainty, "ABSENT");
  // confidence/probability were not supplied by execute() -> still the honest default
  assert.equal(res.confidence, null);
});

test("invokePortal: a realm whose execute() throws returns ERROR, never a crash that escapes the invocation", async () => {
  registerEchoRealmAndPortal({ execute: () => { throw new Error("boom"); } });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
  assert.equal(res.status, PortalResultStatus.ERROR);
  assert.ok(res.reason.includes("boom"));
});

test("invokePortal: an async execute() function is awaited correctly", async () => {
  registerEchoRealmAndPortal({ execute: async (input) => { await Promise.resolve(); return { result: input.x * 2 }; } });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: { x: 5 }, authorization: grantedAuth }));
  assert.equal(res.result, 10);
});

test("invokePortal: result carries realm/portal identity, never ambiguous about which realm answered", async () => {
  registerEchoRealmAndPortal({ execute: () => 1 });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
  assert.equal(res.realmId, "realm.echo");
  assert.equal(res.portalId, "portal.echo");
});

// --- Security Hardening v0.1: default-deny authorization level ---

test("invokePortal: a portal declaring NO authorizationPolicy at all now defaults to requiring EXECUTE, not 'any granted authorization will do'", async () => {
  registerEchoRealmAndPortal({ execute: () => 1 }); // no authorizationPolicy set

  const readOnlyAuth = createAuthorization({ granted: true, level: "READ" });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: readOnlyAuth }));
  assert.equal(res.status, PortalResultStatus.UNAUTHORIZED);

  const executeAuth = createAuthorization({ granted: true, level: "EXECUTE" });
  const res2 = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: executeAuth }));
  assert.equal(res2.status, PortalResultStatus.RESULT);
});

test("invokePortal: authorization level is ordinal, not exact-match — EXECUTE satisfies a portal requiring only READ", async () => {
  realmRegistry.register(createRealm({ id: "realm.echo", name: "Echo", status: RealmStatus.IMPLEMENTED, execute: () => 1 }));
  portalRegistry.register(createPortal({ id: "portal.echo", name: "Echo", realmId: "realm.echo", status: PortalStatus.ACTIVE, authorizationPolicy: { requiredLevel: "READ" } }));

  const readOnlyAuth = createAuthorization({ granted: true, level: "READ" });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: readOnlyAuth }));
  assert.equal(res.status, PortalResultStatus.RESULT);
});

// --- Security Hardening v0.1: concurrent-execution resource limit ---

test("invokePortal: refuses execution once the concurrency ceiling is reached, without ever calling execute()", async () => {
  let resolveFirst;
  const gate = new Promise((resolve) => { resolveFirst = resolve; });
  let callCount = 0;
  registerEchoRealmAndPortal({ execute: async () => { callCount++; await gate; return 1; } });

  _setMaxConcurrentPortalExecutionsForTesting(1);
  try {
    const firstCall = invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
    // Give the first call's execute() a tick to actually start before the second fires.
    await new Promise((r) => setImmediate(r));

    const secondResult = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: grantedAuth }));
    assert.equal(secondResult.status, PortalResultStatus.ERROR);
    assert.match(secondResult.reason, /already in flight/);
    assert.equal(callCount, 1);

    resolveFirst();
    const firstResult = await firstCall;
    assert.equal(firstResult.status, PortalResultStatus.RESULT);
  } finally {
    _resetMaxConcurrentPortalExecutionsForTesting();
  }
});

// --- Adversarial: genuine recursive realm invocation (not just parallel
// fan-out) must also hit the resource-exhaustion ceiling, never recurse
// unboundedly or crash the process ---

test("invokePortal: a realm whose execute() recursively re-invokes the same portal is refused once the concurrency ceiling is hit — recursion is bounded, not unbounded", async () => {
  const MAX_TEST_DEPTH = 10;
  let deepestReached = 0;

  realmRegistry.register(
    createRealm({
      id: "realm.recursive",
      name: "Recursive",
      status: RealmStatus.IMPLEMENTED,
      execute: async (input) => {
        const depth = (input && input.depth) || 0;
        deepestReached = Math.max(deepestReached, depth);
        // Nested under the single "result" key on purpose: execute()'s
        // return object is interpreted by unwrapExecuteOutput.js against a
        // fixed allowlist of top-level keys (result/truth_state/etc.) — a
        // sibling field named e.g. "depth" at the top level would be
        // silently dropped, exactly like the earlier "malicious tool
        // output" test proved. The actual payload belongs INSIDE "result".
        if (depth >= MAX_TEST_DEPTH) return { result: { note: "base case", depth } };
        // Genuine recursion: this realm calls invokePortal on ITSELF again
        // before returning, exactly the shape a compromised/buggy realm
        // triggering unbounded self-invocation would take — not merely two
        // independent parallel calls (already covered above).
        const child = await invokePortal(
          createPortalRequest({ portalId: "portal.recursive", request: { depth: depth + 1 }, authorization: grantedAuth })
        );
        // Carry the FULL child PortalResult (not just its status string) so
        // the test below can walk the entire nested chain looking for the
        // refusal, wherever in the recursion it actually happened — a
        // refusal is only visible one level up from where it occurred, not
        // at every ancestor above that.
        return { result: { note: "recursed", depth, child } };
      },
    })
  );
  portalRegistry.register(createPortal({ id: "portal.recursive", name: "Recursive Portal", realmId: "realm.recursive", status: PortalStatus.ACTIVE }));

  _setMaxConcurrentPortalExecutionsForTesting(3);
  try {
    const res = await invokePortal(createPortalRequest({ portalId: "portal.recursive", request: { depth: 0 }, authorization: grantedAuth }));
    // The outermost call still returns RESULT (its own execute() did
    // complete), but recursion never reached the base case at depth 10 —
    // it was refused well before that once 3 executions were in flight.
    assert.equal(res.status, PortalResultStatus.RESULT);
    assert.ok(deepestReached < MAX_TEST_DEPTH, `recursion reached depth ${deepestReached}, expected it to be refused well before ${MAX_TEST_DEPTH}`);
    // Walk the nested child-result chain: somewhere down it, a level must
    // have been refused with ERROR ("already in flight") — a refusal is
    // only visible one level up from where it happened, not propagated to
    // every ancestor, so the walk must actually descend, not just peek once.
    let node = res;
    let sawRefusal = false;
    for (let hops = 0; hops < MAX_TEST_DEPTH + 1 && node; hops++) {
      const child = node.result && typeof node.result === "object" ? node.result.child : null;
      if (!child) break;
      if (child.status === PortalResultStatus.ERROR) {
        sawRefusal = true;
        break;
      }
      node = child;
    }
    assert.ok(sawRefusal, "expected to find a refused (ERROR, already-in-flight) invocation somewhere in the recursive chain");
  } finally {
    _resetMaxConcurrentPortalExecutionsForTesting();
  }
});

// --- Adversarial: a realm/tool's own output is DATA, never a new grant ---

test("invokePortal: a realm returning output shaped like an authorization grant (granted/authorized/level fields) never elevates anything — unwrapExecuteOutput only ever copies the known result fields", async () => {
  realmRegistry.register(
    createRealm({
      id: "realm.echo",
      name: "Echo",
      status: RealmStatus.IMPLEMENTED,
      execute: () => ({
        result: "looks fine",
        granted: true,
        authorized: true,
        level: "EXECUTE",
        isOwner: true,
        role: "admin",
      }),
    })
  );
  portalRegistry.register(
    createPortal({ id: "portal.echo", name: "Echo Portal", realmId: "realm.echo", status: PortalStatus.ACTIVE, authorizationPolicy: { requiredLevel: "READ" } })
  );

  const readOnlyAuth = createAuthorization({ granted: true, level: "READ" });
  const res = await invokePortal(createPortalRequest({ portalId: "portal.echo", request: {}, authorization: readOnlyAuth }));
  assert.equal(res.status, PortalResultStatus.RESULT);
  assert.equal(res.result, "looks fine");
  // None of a malicious/compromised realm's extra fields leak into the
  // PortalResult shape — they are simply not in unwrapExecuteOutput's
  // fixed allowlist, so a poisoned tool/realm result can never masquerade
  // as a fresh Authorization for a later call.
  assert.equal(res.granted, undefined);
  assert.equal(res.authorized, undefined);
  assert.equal(res.isOwner, undefined);
  assert.equal(res.role, undefined);
});
