"use strict";

const { ResultStatus, HealthState, AuthState } = require("../../shared/constants");
const { assertConnectorShape } = require("./connector");
const credentials = require("../credentials/reference");
const { toNormalizedEvent } = require("../events/adapters/github");

// Reference connector — the architectural proof for a REAL external
// provider. Endpoints verified live against docs.github.com this session:
//   GET /repos/{owner}/{repo}            -> get_repository
//   GET /repos/{owner}/{repo}/commits    -> list_commits
//   GET /user                            -> authenticate() check
// Auth header format (confirmed): "Authorization: Bearer <token>".
// Rate limit signal (confirmed): 403/429 with `x-ratelimit-remaining: 0`.
//
// No production credential exists in this environment. Every code path
// that would make a real request checks credential availability FIRST and
// stops at that boundary — returning BLOCKED with a clear reason — rather
// than attempting a call with no token.
const API_BASE = "https://api.github.com";
const lastResults = new Map();
let health = { failure_count: 0, last_success_at: null, last_failure_at: null };

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "learning-core-reference-connector",
  };
}

function normalizeResult(raw) {
  if (raw.network_error) return ResultStatus.UNKNOWN;
  if (raw.status_code >= 200 && raw.status_code < 300) return ResultStatus.SUCCESS;
  if ((raw.status_code === 403 || raw.status_code === 429) && raw.rate_limited) return ResultStatus.RECOVERING;
  if (raw.status_code === 401 || raw.status_code === 403) return ResultStatus.BLOCKED;
  if (raw.status_code === 404) return ResultStatus.FAILED;
  if (raw.status_code >= 500) return ResultStatus.FAILED;
  return ResultStatus.UNKNOWN;
}

const githubConnector = {
  tool_id: "github",

  connect() {
    return { connected: credentials.isAvailable("github") };
  },

  disconnect() {
    return { connected: false };
  },

  authenticate(fetchImpl = fetch) {
    if (!credentials.isAvailable("github")) {
      return { state: AuthState.DISCONNECTED };
    }
    const token = credentials.getForConnectorUse("github");
    return fetchImpl(`${API_BASE}/user`, { headers: authHeaders(token) })
      .then((res) => {
        if (res.status === 200) {
          health.last_success_at = new Date().toISOString();
          return { state: AuthState.AUTHENTICATED, scopes: ["read"] };
        }
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { state: res.status === 401 ? AuthState.REVOKED : AuthState.ERROR };
      })
      .catch(() => {
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { state: AuthState.ERROR };
      });
  },

  getCapabilities() {
    return ["github.get_repository", "github.list_commits"];
  },

  execute(capabilityId, params, { fetchImpl = fetch } = {}) {
    if (!credentials.isAvailable("github")) {
      return Promise.resolve({
        action_ref: null,
        status_code: null,
        status: ResultStatus.BLOCKED,
        reason: "GITHUB_TOKEN not configured — stopping at the credential boundary, no request was sent.",
      });
    }
    const token = credentials.getForConnectorUse("github");

    // Path segments are encoded so a caller-supplied owner/repo can never
    // inject extra path segments or redirect the request to a different
    // endpoint on this same host.
    const owner = encodeURIComponent(params.owner);
    const repo = encodeURIComponent(params.repo);

    let url;
    if (capabilityId === "github.get_repository") {
      url = `${API_BASE}/repos/${owner}/${repo}`;
    } else if (capabilityId === "github.list_commits") {
      url = `${API_BASE}/repos/${owner}/${repo}/commits`;
    } else {
      return Promise.resolve({ action_ref: null, status_code: null, status: ResultStatus.FAILED, reason: "Unsupported capability for this connector." });
    }

    return fetchImpl(url, { headers: authHeaders(token) })
      .then(async (res) => {
        const rateLimited = res.headers.get("x-ratelimit-remaining") === "0";
        const body = await res.json().catch(() => null);
        const raw = { status_code: res.status, rate_limited: rateLimited, body };
        const status = normalizeResult(raw);
        const actionRef = "gh-" + Date.now();
        lastResults.set(actionRef, { capabilityId, params, raw });
        if (status === ResultStatus.SUCCESS) {
          health.last_success_at = new Date().toISOString();
        } else {
          health.failure_count += 1;
          health.last_failure_at = new Date().toISOString();
        }
        return { action_ref: actionRef, status_code: res.status, status, raw };
      })
      .catch((err) => {
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { action_ref: null, status_code: null, status: ResultStatus.UNKNOWN, reason: "Network error: " + err.message };
      });
  },

  verify(capabilityId, actionRef) {
    const cached = lastResults.get(actionRef);
    if (!cached) return { verified: false, outcome: ResultStatus.UNKNOWN, reason: "No cached result for this action." };
    if (capabilityId === "github.get_repository") {
      const matches = !!cached.raw.body && cached.raw.body.full_name === `${cached.params.owner}/${cached.params.repo}`;
      return { verified: matches, outcome: matches ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
    }
    if (capabilityId === "github.list_commits") {
      const matches = Array.isArray(cached.raw.body);
      return { verified: matches, outcome: matches ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
    }
    return { verified: false, outcome: ResultStatus.UNKNOWN };
  },

  normalizeResult,

  healthCheck() {
    if (!credentials.isAvailable("github")) {
      return { state: HealthState.UNKNOWN, ...health, reason: "No credential configured." };
    }
    if (health.failure_count > 0 && !health.last_success_at) {
      return { state: HealthState.PROVIDER_ERROR, ...health };
    }
    return { state: HealthState.HEALTHY, ...health };
  },

  handleEvent({ headers, rawBody }) {
    const secret = credentials.getForConnectorUse("github_webhook");
    return toNormalizedEvent({ headers, rawBody, secret });
  },
};

assertConnectorShape(githubConnector);

module.exports = githubConnector;
