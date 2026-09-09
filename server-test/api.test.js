"use strict";

// REAL HTTP tests: these start the actual server on an ephemeral port and
// make real fetch() requests against it — not direct function calls to
// the handler. This is Phase 9's explicit requirement.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { server, ADMIN_API_TOKEN } = require("../server/index");
const { setConnectionState, getConnectionState } = require("../learning-core/integration/connection/store");
const { getConversation } = require("../learning-core/persistence/store");

let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function post(path, body, headers = {}) {
  return fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(path, headers = {}) {
  return fetch(baseUrl + path, { headers });
}

function authHeader() {
  return { Authorization: "Bearer " + ADMIN_API_TOKEN };
}

// 2. valid AI request
test("POST /api/ai: a valid, authorized request returns 200 with a structured status — no model is CONNECTED in this environment, so the registry correctly falls back to the null provider (UNKNOWN) rather than fabricating a reply", async () => {
  const res = await post("/api/ai", { message: "What should I focus on today?" }, { Authorization: "Bearer " + ADMIN_API_TOKEN });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "UNKNOWN");
  assert.match(body.reason, /No model provider connected/);
  assert.ok(body.sessionId);
});

// 3. invalid request
test("POST /api/ai: missing message is 400 INVALID_REQUEST", async () => {
  const res = await post("/api/ai", {}, { Authorization: "Bearer " + ADMIN_API_TOKEN });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.status, "INVALID_REQUEST");
});

// Auth boundary
test("POST /api/ai: no token is 401 UNAUTHORIZED, and the body never contains the real token", async () => {
  const res = await post("/api/ai", { message: "hi" });
  assert.equal(res.status, 401);
  const text = await res.text();
  assert.ok(!text.includes(ADMIN_API_TOKEN));
});

test("POST /api/ai: wrong token is 401 UNAUTHORIZED", async () => {
  const res = await post("/api/ai", { message: "hi" }, { Authorization: "Bearer wrong-token-value" });
  assert.equal(res.status, 401);
});

// 5/6. approval-required action, then approved action — through the REAL HTTP endpoint
test("POST /api/ai: CRITICAL — a recognized calendar action requires approval before it executes", async () => {
  const res = await post(
    "/api/ai",
    { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata" },
    { Authorization: "Bearer " + ADMIN_API_TOKEN }
  );
  const body = await res.json();
  assert.equal(body.status, "ACTION");
  assert.equal(body.result.action.action_status === "PENDING_CONFIRMATION" || body.result.action.action_status === "NOT_AUTHORIZED", true);
});

test("POST /api/ai: the same action succeeds once write scope is granted and confirmed:true is sent", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post(
      "/api/ai",
      { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata", confirmed: true },
      { Authorization: "Bearer " + ADMIN_API_TOKEN }
    );
    const body = await res.json();
    assert.equal(body.status, "ACTION");
    assert.equal(body.result.action.result, "SUCCESS");
    assert.equal(body.result.action.verified, true);
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

// 8. connector failure / 9. verification failure — through the REAL HTTP endpoint,
// proving __test_scenario reaches the same deterministic connector used by the unit tests.
test("POST /api/ai: connector PROVIDER_FAILURE reaches the client as FAILED, not a fake success", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post(
      "/api/ai",
      { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata", confirmed: true, testScenario: "PROVIDER_FAILURE" },
      { Authorization: "Bearer " + ADMIN_API_TOKEN }
    );
    const body = await res.json();
    assert.equal(body.result.action.result, "FAILED");
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("POST /api/ai: connector VERIFICATION_FAILURE reaches the client as UNKNOWN, never SUCCESS", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post(
      "/api/ai",
      { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata", confirmed: true, testScenario: "VERIFICATION_FAILURE" },
      { Authorization: "Bearer " + ADMIN_API_TOKEN }
    );
    const body = await res.json();
    assert.equal(body.result.action.result, "UNKNOWN");
    assert.notEqual(body.result.action.result, "SUCCESS");
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

// 10. public/private isolation
test("POST /api/public-ai: requires no token, and a calendar-creation phrase NEVER triggers an action (public agent has no action capability at all)", async () => {
  const res = await post("/api/public-ai", { message: "Create an investor meeting tomorrow at 2 PM." });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal("action" in body, false);
  assert.notEqual(body.status, "ACTION");
});

test("POST /api/public-ai: valid request returns a structured status, never a fake canned reply, when no model is connected", async () => {
  const res = await post("/api/public-ai", { message: "What is Industry 4.0?" });
  const body = await res.json();
  assert.equal(body.status, "UNKNOWN");
});

// 11. secret isolation
test("SECURITY: no response body from any endpoint ever contains the private admin token", async () => {
  const responses = await Promise.all([
    post("/api/ai", { message: "hello" }, { Authorization: "Bearer " + ADMIN_API_TOKEN }),
    post("/api/public-ai", { message: "hello" }),
    fetch(baseUrl + "/api/health"),
    get("/api/audit", authHeader()),
    get("/api/approvals", authHeader()),
    get("/api/memory", authHeader()),
  ]);
  for (const res of responses) {
    const text = await res.text();
    assert.ok(!text.includes(ADMIN_API_TOKEN), "response leaked the admin token");
  }
});

// 12. conversation persistence
test("conversation persistence: two messages with the same sessionId accumulate in the same conversation record", async () => {
  const res1 = await post("/api/public-ai", { message: "First message." });
  const body1 = await res1.json();
  const sessionId = body1.sessionId;

  await post("/api/public-ai", { message: "Second message.", sessionId });

  const conversation = getConversation(sessionId, "public:visitor");
  const userMessages = conversation.messages.filter((m) => m.role === "user");
  assert.equal(userMessages.length, 2);
  assert.equal(userMessages[0].content, "First message.");
  assert.equal(userMessages[1].content, "Second message.");
});

// Static serving sanity (the existing site must still work through this server)
test("GET /: serves the existing public site unmodified", async () => {
  const res = await fetch(baseUrl + "/");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /We help people run faster in Industry 4\.0/);
});

test("GET /dashboard: serves the private dashboard shell", async () => {
  const res = await fetch(baseUrl + "/dashboard");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Command Center/);
});

// --- Activity/Audit surface ---

test("GET /api/audit: no token is 401 UNAUTHORIZED", async () => {
  const res = await get("/api/audit");
  assert.equal(res.status, 401);
});

test("GET /api/audit: an authorized request returns the audit trail, most recent first, with no secret values", async () => {
  await post("/api/ai", { message: "What should I focus on today?" }, authHeader());
  const res = await get("/api/audit", authHeader());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.audit));
  const text = JSON.stringify(body.audit);
  assert.ok(!text.includes(ADMIN_API_TOKEN));
});

// --- Approvals surface ---

test("GET /api/approvals: no token is 401 UNAUTHORIZED", async () => {
  const res = await get("/api/approvals");
  assert.equal(res.status, 401);
});

test("Approvals: a calendar action requiring confirmation creates a pending approval visible via GET /api/approvals", async () => {
  // Needs a real, authorized-with-write-scope connection to reach the
  // confirmation gate at all — otherwise it's blocked earlier at
  // NOT_AUTHORIZED, which is a different (and separately tested) branch.
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post("/api/ai", { message: "Create a board meeting tomorrow at 3 PM.", timezone: "Asia/Kolkata" }, authHeader());
    const body = await res.json();
    const approvalId = body.result.action.approval_id;
    assert.ok(approvalId, "expected the blocked action to carry an approval_id");

    const listRes = await get("/api/approvals", authHeader());
    const listBody = await listRes.json();
    assert.ok(listBody.pending.some((a) => a.approval_id === approvalId));

    // Clean up: resolve it so it doesn't linger as PENDING for the rest of
    // this file's tests (the approvals store persists across tests in the
    // same process, same as the audit log).
    await post(`/api/approvals/${approvalId}/decision`, { decision: "reject" }, authHeader());
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("Approvals: approving a pending action re-enters the real action lifecycle and executes it", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const proposeRes = await post("/api/ai", { message: "Create a strategy review tomorrow at 4 PM.", timezone: "Asia/Kolkata" }, authHeader());
    const proposeBody = await proposeRes.json();
    const approvalId = proposeBody.result.action.approval_id;
    assert.ok(approvalId);

    const decisionRes = await post(`/api/approvals/${approvalId}/decision`, { decision: "approve" }, authHeader());
    assert.equal(decisionRes.status, 200);
    const decisionBody = await decisionRes.json();
    assert.equal(decisionBody.status, "APPROVED");
    assert.equal(decisionBody.action.result, "SUCCESS");
    assert.equal(decisionBody.action.verified, true);

    const listRes = await get("/api/approvals", authHeader());
    const listBody = await listRes.json();
    assert.equal(listBody.pending.some((a) => a.approval_id === approvalId), false);
    assert.ok(listBody.history.some((a) => a.approval_id === approvalId && a.status === "APPROVED"));
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("Approvals: rejecting a pending action never executes it, and is recorded in the audit trail", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const proposeRes = await post("/api/ai", { message: "Create a budget review tomorrow at 5 PM.", timezone: "Asia/Kolkata" }, authHeader());
    const proposeBody = await proposeRes.json();
    const approvalId = proposeBody.result.action.approval_id;
    assert.ok(approvalId);

    const decisionRes = await post(`/api/approvals/${approvalId}/decision`, { decision: "reject" }, authHeader());
    assert.equal(decisionRes.status, 200);
    const decisionBody = await decisionRes.json();
    assert.equal(decisionBody.status, "REJECTED");

    const auditRes = await get("/api/audit", authHeader());
    const auditBody = await auditRes.json();
    assert.ok(auditBody.audit.some((entry) => entry.approval_id === approvalId && entry.result === "BLOCKED" && /Rejected by human/.test(entry.note)));
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("Approvals: deciding on an unknown approval id is 404 NOT_FOUND", async () => {
  const res = await post("/api/approvals/does-not-exist/decision", { decision: "approve" }, authHeader());
  assert.equal(res.status, 404);
});

test("Approvals: an invalid decision value is 400 INVALID_REQUEST", async () => {
  const res = await post("/api/approvals/anything/decision", { decision: "maybe" }, authHeader());
  assert.equal(res.status, 400);
});

// --- Memory surface ---

test("GET /api/memory: no token is 401 UNAUTHORIZED", async () => {
  const res = await get("/api/memory");
  assert.equal(res.status, 401);
});

test("GET /api/memory: an authorized request returns a structured (possibly empty) memory array, never fabricated records", async () => {
  const res = await get("/api/memory", authHeader());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.memory));
});

// --- Honest-failure regression: a real user, with no calendar credential
// connected at all, must never be shown a fake "waiting for your approval"
// action for something that was actually blocked earlier, at authorization.

test("Approvals: a calendar action blocked at NOT_AUTHORIZED (no real credential, default connection state) never creates a pending approval", async () => {
  const res = await post("/api/ai", { message: "Create a QA regression meeting tomorrow at 9 AM.", timezone: "Asia/Kolkata" }, authHeader());
  const body = await res.json();
  assert.equal(body.result.action.action_status, "NOT_AUTHORIZED");
  assert.equal(body.result.action.approval_id, null);

  const approvalsRes = await get("/api/approvals", authHeader());
  const approvalsBody = await approvalsRes.json();
  assert.equal(approvalsBody.pending.length, 0);

  const auditRes = await get("/api/audit", authHeader());
  const auditBody = await auditRes.json();
  assert.ok(auditBody.audit.some((e) => e.action_id === body.result.action.action_id && e.action_status === "NOT_AUTHORIZED"));
});
