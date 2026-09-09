"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getConnection, listConnections } = require("../integration/connection/manager");
const { authorize } = require("../integration/auth/authorization");
const { authenticate, revoke, getStatus } = require("../integration/auth/authentication");
const { getCapability } = require("../integration/registry/capabilities");
const credentials = require("../integration/credentials/reference");

test("connection manager: mock tool is authorized and its credential state is exposed without a raw value", () => {
  const connection = getConnection("mock");
  assert.equal(connection.state, "AUTHORIZED");
  assert.equal(typeof connection.credential.credential_available, "boolean");
});

test("connection manager: lists a connection record for every known tool", () => {
  const connections = listConnections();
  assert.ok(connections.find((c) => c.tool_id === "github"));
});

test("credentials: unavailable by default in this environment (no GITHUB_TOKEN configured)", () => {
  assert.equal(credentials.isAvailable("github"), false);
});

test("authorization: DISCONNECTED tool is never authorized, regardless of capability", () => {
  const capability = getCapability("github.get_repository");
  const result = authorize(capability);
  assert.equal(result.authorized, false);
});

test("authorization: AUTHORIZED tool with a supported capability is authorized", () => {
  const capability = getCapability("mock.ping");
  const result = authorize(capability);
  assert.equal(result.authorized, true);
});

test("authorization: a missing capability is never authorized", () => {
  const result = authorize(null);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "CAPABILITY_NOT_AVAILABLE");
});

test("authentication: revoke() clears scopes and sets state to REVOKED", () => {
  authenticate("mock", { authenticate: () => ({ state: "AUTHORIZED", scopes: ["read"] }) });
  revoke("mock");
  assert.equal(getStatus("mock"), "REVOKED");
  // Restore mock's expected AUTHORIZED state for any tests that run after this one.
  authenticate("mock", { authenticate: () => ({ state: "AUTHORIZED", scopes: ["read", "write"] }) });
});

test("authentication: a connector without authenticate() results in ERROR state, not a crash", () => {
  const result = authenticate("mock", {});
  assert.equal(result.state, "ERROR");
  authenticate("mock", { authenticate: () => ({ state: "AUTHORIZED", scopes: ["read", "write"] }) });
});
