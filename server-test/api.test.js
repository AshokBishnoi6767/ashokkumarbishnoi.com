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
test("SECURITY: no response body from either endpoint ever contains the private admin token", async () => {
  const responses = await Promise.all([
    post("/api/ai", { message: "hello" }, { Authorization: "Bearer " + ADMIN_API_TOKEN }),
    post("/api/public-ai", { message: "hello" }),
    fetch(baseUrl + "/api/health"),
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
