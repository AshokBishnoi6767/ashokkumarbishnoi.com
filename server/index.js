"use strict";

// The actual runtime this product needed: a real server sitting in front
// of the existing learning-core Control/Intelligence Layer. Node's built-in
// http module for routing; Firebase Admin/Auth for the owner identity
// boundary — see integration/auth/firebaseAdmin.js and ownerAccount.js.
//
// Local development / testing only. Not wired to Firebase Hosting or any
// production deployment — see the final report for why (open decision).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const privateAgent = require("../learning-core/core/privateAgent");
const publicAgent = require("../learning-core/core/publicAgent");
const { integrationHealth } = require("../learning-core/integration/health");
const { listProviders } = require("../learning-core/model/registry");
const logger = require("../learning-core/shared/logger");
const { listAudit } = require("../learning-core/integration/audit/log");
const { recordSecurityEvent, listSecurityEvents } = require("../learning-core/integration/audit/securityLog");
const { checkLimit } = require("../learning-core/integration/security/rateLimiter");
const { listPendingApprovals, listAllApprovals } = require("../learning-core/integration/approvals/store");
const { approveAction, rejectAction } = require("../learning-core/integration/actions/lifecycle");
const memoryStore = require("../learning-core/memory/store");
const { MemoryClass } = require("../learning-core/shared/constants");
const firebaseAdmin = require("../learning-core/integration/auth/firebaseAdmin");
const ownerAccount = require("../learning-core/integration/auth/ownerAccount");

const REPO_ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
const DASHBOARD_DIR = path.join(REPO_ROOT, "dashboard");
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

// Firebase web config is NOT a secret — it identifies the project to the
// client SDK; real security comes from Firebase Auth + the owner-uid check
// below, never from hiding this. Registered via `firebase apps:create WEB`
// against the project this repo already deploys to (see .firebaserc) — no
// second Firebase project was created.
const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyAcHA3ob3vIf2zOSF0fLqx9yoTrAJKr1Gk",
  authDomain: "project-5d70366f-a6e4-4264-a35.firebaseapp.com",
  projectId: "project-5d70366f-a6e4-4264-a35",
  appId: "1:232056650491:web:ec5cf80c29952a063b0e5e",
};

// SEO: 301 redirects for pre-redesign URLs with a clear equivalent on the
// current site — mirrors firebase.json's hosting.redirects exactly, so the
// same behavior is real and testable locally, not just declared for
// production. URLs with NO clear equivalent (old /work/, /portfolio.html,
// /services/<old-subpage>/) are deliberately NOT listed here — they 404
// rather than redirecting to the homepage, per the redirect audit in the
// final report.
const LEGACY_REDIRECTS = [
  { pattern: /^\/start-a-project\/?$/, destination: "/contact/" },
  { pattern: /^\/tools\/?$/, destination: "/resources/tools-templates/" },
  { pattern: /^\/insights(\/.*)?\/?$/, destination: "/resources/thought-leadership/" },
  { pattern: /^\/blog(\/.*)?\/?$/, destination: "/resources/articles/" },
];

function matchLegacyRedirect(pathname) {
  for (const { pattern, destination } of LEGACY_REDIRECTS) {
    if (pattern.test(pathname)) return destination;
  }
  return null;
}

// The ONLY private-API authorization boundary: a verified Firebase ID
// token whose uid matches the single configured owner. Nothing supplied by
// the browser (user_id, email, role) is ever trusted — identity comes
// exclusively from firebaseAdmin.verifyIdToken(), which itself calls the
// real Firebase Admin SDK (or the Auth emulator in dev/test).
// Resolves the caller's IP for rate limiting and security-event logging
// only — never used as an identity or authorization signal. Reads
// directly off the socket; this process is not deployed behind a
// reverse proxy today (see functions-entry.js's own boundary notes), so
// there is no trusted proxy whose X-Forwarded-For would be safe to
// prefer over it — a client-supplied header is trivially spoofable.
function clientIp(req) {
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

async function authorizeOwnerRequest(req) {
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Bearer ")) {
    // Not a security event: this is the ordinary "not signed in yet"
    // state every anonymous page load hits (e.g. the dashboard's own
    // auth-state check) — logging it would drown real signal in noise.
    return { authorized: false, reason: "Missing bearer token." };
  }
  const idToken = header.slice("Bearer ".length);
  const verification = await firebaseAdmin.verifyIdToken(idToken);
  if (!verification.ok) {
    // A token that failed real verification (forged, expired, malformed)
    // IS a meaningful signal, unlike simply having none.
    recordSecurityEvent({ event: "owner_auth_failed", reason: verification.reason, path: req.url, ip: clientIp(req) });
    return { authorized: false, reason: verification.reason };
  }
  if (!ownerAccount.isOwner(verification.uid)) {
    // A genuinely authenticated Firebase user who is NOT the owner
    // reaching a private route is the most meaningful signal of all.
    recordSecurityEvent({ event: "owner_auth_failed", reason: "Authenticated user is not the configured owner.", path: req.url, ip: clientIp(req), uid: verification.uid });
    return { authorized: false, reason: "Authenticated user is not the configured owner." };
  }
  return { authorized: true, uid: verification.uid, email: verification.email, userScope: "private:" + verification.uid };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return; // already rejected — drain without buffering further, don't destroy the socket
      size += chunk.length;
      if (size > 1e6) {
        // req.destroy() here would kill the underlying socket before the
        // caller can write a clean 400 response (a real bug this exact
        // scenario surfaced: the client saw ECONNRESET, not INVALID_REQUEST).
        // Rejecting without destroying keeps the connection alive for the
        // response, while discarding (not buffering) further chunks still
        // bounds memory the same as before.
        tooLarge = true;
        data = "";
        reject(new Error("Request body too large."));
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (tooLarge) return; // already settled
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

// Serves static files from a given root directory, resolving directory
// requests to index.html (matching Firebase Hosting's clean-URL behavior)
// and rejecting any path that escapes the root.
function serveStatic(rootDir, urlPath, res) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const safeRelative = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(rootDir, safeRelative);
  if (!filePath.startsWith(rootDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  if (!path.extname(filePath)) {
    filePath = path.join(filePath, "index.html");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      const notFound = path.join(rootDir, "404.html");
      fs.readFile(notFound, (err2, content2) => {
        if (err2) {
          sendJson(res, 404, { error: "Not found" });
        } else {
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end(content2);
        }
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

// The actual request-handling logic, kept independent of http.createServer
// so it can be reused verbatim by a Cloud Functions gen2 HTTPS trigger
// (see functions-entry.js) — same handler, same behavior, whichever
// runtime is fronting it. Nothing about the Control Layer / auth / audit
// path changes between local dev and that production runtime.
// Baseline response hardening headers — non-breaking defaults (no CSP:
// the site loads no third-party scripts/styles today except the Firebase
// SDK as an ES module from gstatic.com in the sign-in/dashboard pages,
// and a CSP tight enough to matter needs a page-by-page connect-src/
// script-src audit this milestone did not do; adding a wrong CSP would
// silently break sign-in, which is worse than the current gap).
function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
}

// Rate limits are keyed by IP for anonymous/pre-auth surfaces (the only
// identity available before a token is verified) and by uid for the
// authenticated private endpoint — a compromised or leaked owner token
// still gets bounded, not unlimited, request volume.
const PUBLIC_AI_LIMIT = { max: 30, windowMs: 60_000 };
const SETUP_OWNER_LIMIT = { max: 5, windowMs: 60_000 };
const PRIVATE_AI_LIMIT = { max: 60, windowMs: 60_000 };

function rateLimited(res, correlationId, key, limitConfig, event) {
  const { allowed, retryAfterMs } = checkLimit(key, limitConfig);
  if (!allowed) {
    recordSecurityEvent({ event, key, correlationId });
    res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
    sendJson(res, 429, { status: "RATE_LIMITED", reason: "Too many requests; please slow down." });
    return true;
  }
  return false;
}

async function requestHandler(req, res) {
  const correlationId = randomUUID();
  const url = req.url || "/";
  applySecurityHeaders(res);

  try {
    // SEO: pre-redesign URL redirects, checked before any other routing —
    // matches how Firebase Hosting evaluates redirects before rewrites.
    const pathname = url.split("?")[0];
    const legacyDestination = matchLegacyRedirect(pathname);
    if (legacyDestination) {
      res.writeHead(301, { Location: legacyDestination });
      return res.end();
    }

    // --- Authentication surface: public, but deliberately tiny. ---
    if (req.method === "GET" && url === "/api/auth/config") {
      return sendJson(res, 200, { ...FIREBASE_WEB_CONFIG, ownerConfigured: ownerAccount.isOwnerConfigured() });
    }

    // First-time owner setup ONLY. Server-controlled, not a public
    // registration form: the owner-already-configured check happens here,
    // before any Firebase user is created, and again atomically inside
    // ownerAccount.setupOwner() to close the race window. After the first
    // successful call, this endpoint always refuses.
    if (req.method === "POST" && url === "/api/auth/setup-owner") {
      if (rateLimited(res, correlationId, clientIp(req), SETUP_OWNER_LIMIT, "setup_owner_rate_limited")) return;
      if (ownerAccount.isOwnerConfigured()) {
        return sendJson(res, 409, { status: "OWNER_ALREADY_CONFIGURED", reason: "Owner setup has already been completed." });
      }
      const body = await readJsonBody(req).catch((err) => ({ __error: err.message }));
      if (body.__error || typeof body.email !== "string" || typeof body.password !== "string" || body.password.length < 6) {
        return sendJson(res, 400, {
          status: "INVALID_REQUEST",
          reason: body.__error || "email and a password of at least 6 characters are required.",
        });
      }
      const created = await firebaseAdmin.createUser({ email: body.email, password: body.password });
      if (!created.ok) {
        logger.warn("owner_setup_failed", { correlationId, reason: created.reason });
        return sendJson(res, 502, { status: "SETUP_FAILED", reason: created.reason });
      }
      const setup = ownerAccount.setupOwner({ uid: created.uid, email: created.email });
      if (!setup.ok) {
        // Race: another request completed setup between the check above and now.
        return sendJson(res, 409, { status: "OWNER_ALREADY_CONFIGURED", reason: setup.reason });
      }
      logger.info("owner_setup", { correlationId, uid: created.uid });
      return sendJson(res, 200, { status: "OWNER_CREATED", email: created.email });
    }

    if (req.method === "GET" && url === "/api/auth/me") {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      return sendJson(res, 200, { uid: auth.uid, email: auth.email });
    }

    if (req.method === "POST" && url === "/api/ai") {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) {
        logger.warn("private_ai_unauthorized", { correlationId, reason: auth.reason });
        return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      }
      if (rateLimited(res, correlationId, auth.uid, PRIVATE_AI_LIMIT, "private_ai_rate_limited")) return;
      const body = await readJsonBody(req).catch((err) => ({ __error: err.message }));
      if (body.__error || typeof body.message !== "string") {
        return sendJson(res, 400, { status: "INVALID_REQUEST", reason: body.__error || "message (string) is required." });
      }
      const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : randomUUID();
      const result = await privateAgent.handleMessage({
        message: body.message,
        sessionId,
        timezone: typeof body.timezone === "string" ? body.timezone : null,
        confirmed: body.confirmed === true,
        testScenario: typeof body.testScenario === "string" ? body.testScenario : null,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        userScope: auth.userScope,
        requestedBy: auth.email || auth.uid,
      });
      logger.info("private_ai_request", { correlationId, sessionId, uid: auth.uid, status: result.status });
      return sendJson(res, 200, { ...result, sessionId });
    }

    if (req.method === "POST" && url === "/api/public-ai") {
      if (rateLimited(res, correlationId, clientIp(req), PUBLIC_AI_LIMIT, "public_ai_rate_limited")) return;
      const body = await readJsonBody(req).catch((err) => ({ __error: err.message }));
      if (body.__error || typeof body.message !== "string") {
        return sendJson(res, 400, { status: "INVALID_REQUEST", reason: body.__error || "message (string) is required." });
      }
      const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : randomUUID();
      const result = await publicAgent.handleMessage({ message: body.message, sessionId });
      logger.info("public_ai_request", { correlationId, sessionId, status: result.status });
      return sendJson(res, 200, { ...result, sessionId });
    }

    if (req.method === "GET" && url === "/api/health") {
      return sendJson(res, 200, { models: listProviders(), integrations: integrationHealth() });
    }

    // Everything below is private dashboard data (activity, approvals,
    // memory) — same verified-owner boundary as /api/ai, never reachable
    // anonymously and never reachable by an authenticated non-owner user.
    if (req.method === "GET" && url === "/api/audit") {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      const entries = listAudit().slice(-200).reverse();
      return sendJson(res, 200, { audit: entries });
    }

    // Security events (auth failures, rate-limit trips, Universe
    // authorization denials) — a distinct collection from /api/audit's
    // action-lifecycle outcomes; same owner-only boundary.
    if (req.method === "GET" && url === "/api/security-events") {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      const events = listSecurityEvents().slice(-200).reverse();
      return sendJson(res, 200, { security_events: events });
    }

    if (req.method === "GET" && url === "/api/approvals") {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      const pending = listPendingApprovals();
      const history = listAllApprovals()
        .filter((a) => a.status !== "PENDING")
        .slice(0, 50);
      return sendJson(res, 200, { pending, history });
    }

    const approvalDecisionMatch = req.method === "POST" && url.match(/^\/api\/approvals\/([^/?]+)\/decision$/);
    if (approvalDecisionMatch) {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      const approvalId = decodeURIComponent(approvalDecisionMatch[1]);
      const body = await readJsonBody(req).catch((err) => ({ __error: err.message }));
      if (body.__error || (body.decision !== "approve" && body.decision !== "reject")) {
        return sendJson(res, 400, { status: "INVALID_REQUEST", reason: body.__error || "decision must be 'approve' or 'reject'." });
      }
      const outcome =
        body.decision === "approve" ? await approveAction(approvalId) : rejectAction(approvalId, { rejectedBy: auth.email || auth.uid });
      logger.info("approval_decision", { correlationId, approvalId, decision: body.decision, status: outcome.status });
      if (outcome.status === "NOT_FOUND") return sendJson(res, 404, outcome);
      return sendJson(res, 200, outcome);
    }

    if (req.method === "GET" && url === "/api/memory") {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      const records = Object.values(MemoryClass).flatMap((memoryClass) =>
        memoryStore.query(memoryClass, (r) => r.user_scope === auth.userScope).map((record) => ({ ...record, memory_class: memoryClass }))
      );
      return sendJson(res, 200, { memory: records });
    }

    // The owner's explicit "remove this" — see learning-core/memory/store.js
    // forget(): distinct from a correction's supersession, which keeps the
    // old record for provenance. This deletes it outright, and only if the
    // record actually belongs to the authenticated owner's scope.
    const memoryDeleteMatch = req.method === "DELETE" && url.match(/^\/api\/memory\/([^/?]+)\/([^/?]+)$/);
    if (memoryDeleteMatch) {
      const auth = await authorizeOwnerRequest(req);
      if (!auth.authorized) return sendJson(res, 401, { status: "UNAUTHORIZED", reason: auth.reason });
      const memoryClass = decodeURIComponent(memoryDeleteMatch[1]);
      const memoryId = decodeURIComponent(memoryDeleteMatch[2]);
      if (!MemoryClass[memoryClass]) {
        return sendJson(res, 400, { status: "INVALID_REQUEST", reason: `Unknown memory class: ${memoryClass}` });
      }
      const existing = memoryStore.recall(memoryClass, memoryId);
      if (!existing || existing.user_scope !== auth.userScope) {
        return sendJson(res, 404, { status: "NOT_FOUND" });
      }
      const deleted = memoryStore.forget(memoryClass, memoryId);
      logger.info("memory_forget", { correlationId, memoryClass, memoryId, deleted, uid: auth.uid });
      if (!deleted) return sendJson(res, 404, { status: "NOT_FOUND" });
      return sendJson(res, 200, { status: "DELETED" });
    }

    if (url === "/dashboard" || url.startsWith("/dashboard/") || url.startsWith("/dashboard?")) {
      const sub = url.replace(/^\/dashboard/, "") || "/";
      return serveStatic(DASHBOARD_DIR, sub === "/" ? "/index.html" : sub, res);
    }

    return serveStatic(PUBLIC_DIR, url, res);
  } catch (err) {
    logger.error("server_error", { correlationId, message: err.message });
    sendJson(res, 500, { status: "SERVER_ERROR" });
  }
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] public site:     http://localhost:${PORT}/`);
    console.log(`[server] private dashboard: http://localhost:${PORT}/dashboard (sign in required)`);
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      console.log(
        "[server] FIREBASE_AUTH_EMULATOR_HOST is not set — sign-in will try to reach real Firebase Auth, which requires it to be enabled in the Firebase Console first (see the final report)."
      );
    }
  });
}

module.exports = { server, requestHandler, FIREBASE_WEB_CONFIG };
