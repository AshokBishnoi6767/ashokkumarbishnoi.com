"use strict";

// The actual runtime this product needed: a real server sitting in front
// of the existing learning-core Control/Intelligence Layer. Zero external
// dependencies — Node's built-in http module only.
//
// Local development / testing only. Not wired to Firebase Hosting or any
// production deployment — see the final report for why (open decision).
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { randomUUID } = require("crypto");

const privateAgent = require("../learning-core/core/privateAgent");
const publicAgent = require("../learning-core/core/publicAgent");
const { integrationHealth } = require("../learning-core/integration/health");
const { listProviders } = require("../learning-core/model/registry");
const logger = require("../learning-core/shared/logger");

const REPO_ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
const DASHBOARD_DIR = path.join(REPO_ROOT, "dashboard");
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

// This app's OWN access-control secret — not a third-party credential.
// Generated fresh each process start if not supplied, and never written
// to disk or logged again after this one startup line.
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || crypto.randomBytes(24).toString("hex");
if (!process.env.ADMIN_API_TOKEN) {
  console.log(`\n[server] No ADMIN_API_TOKEN set — generated one for this run only:\n  ${ADMIN_API_TOKEN}\n  Use it as: Authorization: Bearer ${ADMIN_API_TOKEN}\n`);
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
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
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

function isAuthorizedPrivateRequest(req) {
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(ADMIN_API_TOKEN);
  if (tokenBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
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

const server = http.createServer(async (req, res) => {
  const correlationId = randomUUID();
  const url = req.url || "/";

  try {
    if (req.method === "POST" && url === "/api/ai") {
      if (!isAuthorizedPrivateRequest(req)) {
        logger.warn("private_ai_unauthorized", { correlationId });
        return sendJson(res, 401, { status: "UNAUTHORIZED", reason: "Missing or invalid bearer token." });
      }
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
      });
      logger.info("private_ai_request", { correlationId, sessionId, status: result.status });
      return sendJson(res, 200, { ...result, sessionId });
    }

    if (req.method === "POST" && url === "/api/public-ai") {
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

    if (url === "/dashboard" || url.startsWith("/dashboard/") || url.startsWith("/dashboard?")) {
      const sub = url.replace(/^\/dashboard/, "") || "/";
      return serveStatic(DASHBOARD_DIR, sub === "/" ? "/index.html" : sub, res);
    }

    return serveStatic(PUBLIC_DIR, url, res);
  } catch (err) {
    logger.error("server_error", { correlationId, message: err.message });
    sendJson(res, 500, { status: "SERVER_ERROR" });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] public site:     http://localhost:${PORT}/`);
    console.log(`[server] private dashboard: http://localhost:${PORT}/dashboard`);
  });
}

module.exports = { server, ADMIN_API_TOKEN };
