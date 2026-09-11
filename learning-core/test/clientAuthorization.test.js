"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { createClientAuthorization, checkClientAuthorization, isExpired } = require("../integration/security/clientAuthorization");

function baseGrant(overrides = {}) {
  return createClientAuthorization({
    client_id: "C-001",
    scope: ["resource.alpha", "resource.beta"],
    purpose: "security monitoring / operational analysis",
    allowed_operations: ["observe", "analyze", "correlate"],
    prohibited_operations: ["modify", "delete", "export"],
    granted_by: "owner",
    ...overrides,
  });
}

test("createClientAuthorization: refuses to construct an authorization missing any required field — nothing is implicit", () => {
  assert.throws(() => createClientAuthorization({ scope: ["x"], purpose: "p", allowed_operations: ["observe"] }), /client_id is required/);
  assert.throws(() => createClientAuthorization({ client_id: "C-001", purpose: "p", allowed_operations: ["observe"] }), /scope is required/);
  assert.throws(() => createClientAuthorization({ client_id: "C-001", scope: ["x"], allowed_operations: ["observe"] }), /purpose is required/);
  assert.throws(() => createClientAuthorization({ client_id: "C-001", scope: ["x"], purpose: "p" }), /allowed_operations is required/);
});

test("createClientAuthorization: refuses an empty scope or empty allowed_operations — an unbounded grant is never a valid 'smaller' grant", () => {
  assert.throws(() => createClientAuthorization({ client_id: "C-001", scope: [], purpose: "p", allowed_operations: ["observe"] }), /non-empty array/);
  assert.throws(() => createClientAuthorization({ client_id: "C-001", scope: ["x"], purpose: "p", allowed_operations: [] }), /non-empty array/);
});

test("checkClientAuthorization: no authorization at all is denied", () => {
  const result = checkClientAuthorization({ resource: "resource.alpha", operation: "observe" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /No client authorization supplied/);
});

test("checkClientAuthorization: an authorized operation on an in-scope resource is allowed", () => {
  const grant = baseGrant();
  const result = checkClientAuthorization({ authorization: grant, resource: "resource.alpha", operation: "observe" });
  assert.equal(result.allowed, true);
  assert.equal(result.client_id, "C-001");
});

test("checkClientAuthorization: a resource outside the authorized scope is denied — observing one resource never authorizes another", () => {
  const grant = baseGrant();
  const result = checkClientAuthorization({ authorization: grant, resource: "resource.gamma", operation: "observe" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /outside the authorized scope/);
});

test("checkClientAuthorization: an operation not in allowed_operations is denied (default-deny)", () => {
  const grant = baseGrant();
  const result = checkClientAuthorization({ authorization: grant, resource: "resource.alpha", operation: "execute" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /not in the authorized operation list/);
});

test("checkClientAuthorization: an explicitly prohibited operation is denied even if a caller also lists it as allowed", () => {
  const grant = baseGrant({ allowed_operations: ["observe", "delete"], prohibited_operations: ["delete"] });
  const result = checkClientAuthorization({ authorization: grant, resource: "resource.alpha", operation: "delete" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /explicitly prohibited/);
});

test("checkClientAuthorization: an expired authorization is denied regardless of scope/operation correctness", () => {
  const grant = baseGrant({ expires_at: "2020-01-01T00:00:00.000Z" });
  const result = checkClientAuthorization({ authorization: grant, resource: "resource.alpha", operation: "observe" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /expired/);
});

test("checkClientAuthorization: a null expires_at means no expiration was set, which is honored, but is never the default an accidental omission falls back to silently", () => {
  const grant = baseGrant({ expires_at: null });
  assert.equal(isExpired(grant), false);
  const result = checkClientAuthorization({ authorization: grant, resource: "resource.alpha", operation: "observe" });
  assert.equal(result.allowed, true);
});

test("checkClientAuthorization: authorizing client C-001 for resource.alpha never authorizes a DIFFERENT client's identically-named resource — scope is per-authorization, not per-resource-string", () => {
  const grantForA = baseGrant({ client_id: "C-001", scope: ["tenant-a/resource.alpha"] });
  const resultAgainstB = checkClientAuthorization({ authorization: grantForA, resource: "tenant-b/resource.alpha", operation: "observe" });
  assert.equal(resultAgainstB.allowed, false);
});

test("checkClientAuthorization: missing resource or operation arguments are denied, never treated as a wildcard", () => {
  const grant = baseGrant();
  assert.equal(checkClientAuthorization({ authorization: grant, operation: "observe" }).allowed, false);
  assert.equal(checkClientAuthorization({ authorization: grant, resource: "resource.alpha" }).allowed, false);
});
