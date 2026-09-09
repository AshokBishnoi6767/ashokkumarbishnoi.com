"use strict";

// Production runtime entry point: Firebase Functions gen2 HTTPS trigger
// fronting the EXACT SAME request handler that server/index.js runs
// locally (http.createServer(requestHandler)) — no separate execution
// path, no duplicated routing/auth/action logic. Deployed with
// firebase.json's functions.source = "." (the whole repo), so every
// relative require inside server/index.js and learning-core/ resolves
// exactly as it does locally.
//
// Required at deploy time, as a real secret (not committed, not in this
// file, not in firebase.json): ADMIN_API_TOKEN. Without it, the private
// dashboard boundary still works — the handler generates a fresh random
// token on every cold start (see server/index.js) — but that token
// changes on every cold start, which is not usable in production. Set it
// with `firebase functions:secrets:set ADMIN_API_TOKEN` before deploying
// for real use. ANTHROPIC_API_KEY is the same kind of boundary for real
// model replies instead of NOT_CONFIGURED.
const { onRequest } = require("firebase-functions/v2/https");
const { requestHandler } = require("./server/index");

exports.api = onRequest({ region: "us-central1", secrets: ["ADMIN_API_TOKEN", "ANTHROPIC_API_KEY"] }, requestHandler);
