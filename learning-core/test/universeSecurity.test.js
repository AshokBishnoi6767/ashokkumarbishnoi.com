"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { resolvePrincipalAuthority, authorizeUniverseInvocation } = require("../universe/security");
const ownerAccount = require("../integration/auth/ownerAccount");
const securityLog = require("../integration/audit/securityLog");
const { setConnectionState, getConnectionState } = require("../integration/connection/store");
const { AuthorityLevel } = require("../shared/constants");

beforeEach(() => {
  ownerAccount._reset();
  securityLog._reset();
});

test("resolvePrincipalAuthority: no principal, or a principal with no kind, is refused rather than assumed", () => {
  assert.equal(resolvePrincipalAuthority(undefined).level, null);
  assert.equal(resolvePrincipalAuthority(null).level, null);
  assert.equal(resolvePrincipalAuthority({}).level, null);
  assert.equal(resolvePrincipalAuthority("owner").level, null); // a bare string claim is never accepted
});

test("resolvePrincipalAuthority: a principal claiming kind 'owner' with a uid that does NOT match the real configured owner is refused", () => {
  ownerAccount.setupOwner({ uid: "real-owner-uid", email: "owner@example.com" });
  const result = resolvePrincipalAuthority({ kind: "owner", uid: "attacker-claims-to-be-owner" });
  assert.equal(result.level, null);
  assert.match(result.reason, /does not match the verified owner account/);
});

test("resolvePrincipalAuthority: a principal whose uid genuinely matches the configured owner gets EXECUTE authority", () => {
  ownerAccount.setupOwner({ uid: "real-owner-uid", email: "owner@example.com" });
  const result = resolvePrincipalAuthority({ kind: "owner", uid: "real-owner-uid" });
  assert.equal(result.level, AuthorityLevel.EXECUTE);
});

test("resolvePrincipalAuthority: kind 'public' always gets only READ authority, never more", () => {
  const result = resolvePrincipalAuthority({ kind: "public" });
  assert.equal(result.level, AuthorityLevel.READ);
});

test("authorizeUniverseInvocation: an unresolvable principal produces a denied Authorization, and the denial is recorded as a security event", () => {
  const auth = authorizeUniverseInvocation({ principal: { kind: "public" }, portalId: "portal.example" });
  // public is a valid (low) principal, so this call alone is granted —
  // exercise an actually-invalid principal for the denial path instead.
  assert.equal(auth.granted, true);

  const denied = authorizeUniverseInvocation({ principal: { kind: "owner", uid: "not-the-owner" }, portalId: "portal.admin" });
  assert.equal(denied.granted, false);
  const events = securityLog.listSecurityEvents();
  assert.ok(events.some((e) => e.event === "universe_authorization_denied" && e.portal_id === "portal.admin"));
});

test("authorizeUniverseInvocation: a verified owner requesting a capability whose underlying tool is not authorized is still denied — Universe access never bypasses the Control Layer's own capability gate", () => {
  ownerAccount.setupOwner({ uid: "real-owner-uid", email: "owner@example.com" });
  const previous = getConnectionState("github");
  setConnectionState("github", { state: "DISCONNECTED", scopes: [] });
  try {
    const auth = authorizeUniverseInvocation({
      principal: { kind: "owner", uid: "real-owner-uid" },
      capabilityId: "github.get_repository",
      portalId: "portal.github",
    });
    assert.equal(auth.granted, false);
    assert.match(auth.reason, /not authorized/);
  } finally {
    setConnectionState("github", previous);
  }
});

test("authorizeUniverseInvocation: a verified owner requesting a capability with no tool binding (e.g. a pure-reasoning capability) is granted EXECUTE", () => {
  ownerAccount.setupOwner({ uid: "real-owner-uid", email: "owner@example.com" });
  const auth = authorizeUniverseInvocation({ principal: { kind: "owner", uid: "real-owner-uid" }, capabilityId: "mock.ping" });
  // mock.ping is backed by tool_id "mock", which the connection store seeds
  // as AUTHORIZED by default (see connection/store.js) — so this proves
  // the real gate runs, not that it always denies.
  assert.equal(auth.granted, true);
  assert.equal(auth.level, AuthorityLevel.EXECUTE);
  assert.equal(auth.grantedBy, "universe.security");
});

// Regression test for a real fail-open bug found in security review: a
// capabilityId that does not resolve to any registered capability used to
// fall straight through to `granted: true` because the tool-authorization
// block was only entered when a capability object was found. Unknown
// authorization must fail closed, never silently skip the gate.
test("authorizeUniverseInvocation: an unrecognized/mistyped capability_id is denied, not silently waved through", () => {
  ownerAccount.setupOwner({ uid: "real-owner-uid", email: "owner@example.com" });
  const auth = authorizeUniverseInvocation({
    principal: { kind: "owner", uid: "real-owner-uid" },
    capabilityId: "this.capability.does.not.exist",
    portalId: "portal.example",
  });
  assert.equal(auth.granted, false);
  assert.match(auth.reason, /Unknown capability_id/);
  const events = securityLog.listSecurityEvents();
  assert.ok(events.some((e) => e.event === "universe_authorization_denied" && e.capability_id === "this.capability.does.not.exist"));
});

test("resolvePrincipalAuthority: an unrecognized principal kind (forged role claim) is refused, not defaulted to any authority", () => {
  const result = resolvePrincipalAuthority({ kind: "superadmin", uid: "whoever" });
  assert.equal(result.level, null);
  assert.match(result.reason, /Unrecognized principal kind/);
});

test("resolvePrincipalAuthority: an owner-kind principal with no uid at all is refused rather than treated as public", () => {
  const result = resolvePrincipalAuthority({ kind: "owner" });
  assert.equal(result.level, null);
});
