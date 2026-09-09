"use strict";

// Production runtime entry point: Firebase Functions gen2 HTTPS trigger
// fronting the EXACT SAME request handler that server/index.js runs
// locally (http.createServer(requestHandler)) — no separate execution
// path, no duplicated routing/auth/action logic. Deployed with
// firebase.json's functions.source = "." (the whole repo), so every
// relative require inside server/index.js and learning-core/ resolves
// exactly as it does locally.
//
// The private-API boundary is now real Firebase Authentication (see
// learning-core/integration/auth/), not an app-level static token — a
// deployed Cloud Functions instance gets Application Default Credentials
// automatically, so firebase-admin needs no secret at all here. The one
// remaining credential boundary is ANTHROPIC_API_KEY, for real model
// replies instead of NOT_CONFIGURED — set it with
// `firebase functions:secrets:set ANTHROPIC_API_KEY` before deploying for
// real use. Real Firebase Authentication must also be enabled once in the
// Firebase Console before any of this works against production — see the
// final report for that exact, one-time action.
const { onRequest } = require("firebase-functions/v2/https");
const { requestHandler } = require("./server/index");

exports.api = onRequest({ region: "us-central1", secrets: ["ANTHROPIC_API_KEY"] }, requestHandler);
