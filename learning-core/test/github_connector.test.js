"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const githubConnector = require("../integration/connectors/githubConnector");

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("github connector: declares only the capabilities it actually implements", () => {
  assert.deepEqual(githubConnector.getCapabilities(), ["github.get_repository", "github.list_commits"]);
});

test("github connector: execute() makes NO network call when no credential is configured", async () => {
  let called = false;
  const spyFetch = () => {
    called = true;
    throw new Error("should never be called");
  };
  const result = await withEnv("GITHUB_TOKEN", undefined, () =>
    githubConnector.execute("github.get_repository", { owner: "octocat", repo: "hello-world" }, { fetchImpl: spyFetch })
  );
  assert.equal(called, false);
  assert.equal(result.status, "BLOCKED");
  assert.match(result.reason, /credential boundary/);
});

test("github connector: authenticate() makes NO network call when no credential is configured", async () => {
  const result = await withEnv("GITHUB_TOKEN", undefined, () => githubConnector.authenticate(() => { throw new Error("should never be called"); }));
  assert.equal(result.state, "DISCONNECTED");
});

test("github connector: normalizeResult maps a 200 to SUCCESS and a 404 to FAILED", () => {
  assert.equal(githubConnector.normalizeResult({ status_code: 200, rate_limited: false }), "SUCCESS");
  assert.equal(githubConnector.normalizeResult({ status_code: 404, rate_limited: false }), "FAILED");
});

test("github connector: normalizeResult maps a rate-limited 403 to RECOVERING, not FAILED", () => {
  assert.equal(githubConnector.normalizeResult({ status_code: 403, rate_limited: true }), "RECOVERING");
});

test("github connector: normalizeResult maps a plain 401/403 (bad token) to BLOCKED", () => {
  assert.equal(githubConnector.normalizeResult({ status_code: 401, rate_limited: false }), "BLOCKED");
});

test("github connector: execute() calls the real endpoint shape and normalizes a successful response when credential IS present", async () => {
  const fakeRepo = { full_name: "octocat/hello-world" };
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/octocat/hello-world");
    assert.equal(options.headers.Authorization, "Bearer test-token-value");
    return {
      status: 200,
      headers: { get: () => null },
      json: async () => fakeRepo,
    };
  };
  const result = await withEnv("GITHUB_TOKEN", "test-token-value", () =>
    githubConnector.execute("github.get_repository", { owner: "octocat", repo: "hello-world" }, { fetchImpl })
  );
  assert.equal(result.status, "SUCCESS");
  assert.ok(result.action_ref);

  const verification = await Promise.resolve(githubConnector.verify("github.get_repository", result.action_ref, { owner: "octocat", repo: "hello-world" }));
  assert.equal(verification.verified, true);
});

test("github connector: execute() URL-encodes owner/repo so a crafted param can't inject an extra path segment", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://api.github.com/repos/octocat/hello-world%2F..%2F..%2Forgs%2Fevil%2Frepos");
    return { status: 404, headers: { get: () => null }, json: async () => null };
  };
  await withEnv("GITHUB_TOKEN", "test-token-value", () =>
    githubConnector.execute("github.get_repository", { owner: "octocat", repo: "hello-world/../../orgs/evil/repos" }, { fetchImpl })
  );
});

test("github connector: handleEvent rejects a webhook with an invalid signature", () => {
  const result = withEnv("GITHUB_WEBHOOK_SECRET", "test-secret", () =>
    githubConnector.handleEvent({
      headers: { "x-hub-signature-256": "sha256=deadbeef", "x-github-delivery": "abc-123", "x-github-event": "push" },
      rawBody: JSON.stringify({ ref: "refs/heads/main" }),
    })
  );
  assert.equal(result.signature_verified, false);
});
