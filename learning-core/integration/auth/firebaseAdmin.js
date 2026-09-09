"use strict";

// Server-side Firebase ID token verification and owner-account creation.
// Lazily initializes the Admin SDK so requiring this module never crashes
// on its own — same "stop at the credential boundary, report clearly"
// pattern as model/anthropicProvider.js and integration/credentials/reference.js.
//
// No service account key is ever read from or stored in this repo:
//   - A real deployed Cloud Functions runtime supplies Application Default
//     Credentials automatically (admin.initializeApp() with no args works).
//   - Local development against the Firebase Auth EMULATOR needs no
//     credentials at all — set FIREBASE_AUTH_EMULATOR_HOST and the Admin
//     SDK talks to the emulator instead of real Google servers.
//   - Local development against the REAL project would additionally need
//     `gcloud auth application-default login`, and real project
//     Authentication must be enabled first in the Firebase Console — see
//     the final report for this exact human-authority boundary.
let admin = null;
let adminApp = null;
let testAuthOverride = null;

function loadAdminSdk() {
  if (!admin) {
    admin = require("firebase-admin");
  }
  return admin;
}

// A real deployed Cloud Functions runtime sets GCLOUD_PROJECT automatically.
// Locally it doesn't, so admin.initializeApp() can't detect a project id on
// its own (confirmed: it throws "Unable to detect a Project Id" without
// this) — fall back to the same project this repo already deploys to (see
// .firebaserc), never a different/second project.
const DEFAULT_PROJECT_ID = "project-5d70366f-a6e4-4264-a35";

function getAdminAuth() {
  if (testAuthOverride) return testAuthOverride;
  const sdk = loadAdminSdk();
  if (!adminApp) {
    adminApp = sdk.initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID });
  }
  return sdk.auth(adminApp);
}

// Test-only seam — mirrors the _reset()/injection pattern used throughout
// this tree (memory/store.js, connection/store.js, etc.) rather than
// mocking the real Firebase SDK, which needs a live emulator to behave
// correctly at all. Never used outside tests.
function setAdminAuthForTesting(fakeAuth) {
  testAuthOverride = fakeAuth;
}
function _resetAdminAuthForTesting() {
  testAuthOverride = null;
}

async function verifyIdToken(idToken) {
  if (typeof idToken !== "string" || !idToken) {
    return { ok: false, reason: "No ID token provided." };
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { ok: true, uid: decoded.uid, email: decoded.email || null };
  } catch (err) {
    return { ok: false, reason: "Token verification failed: " + err.message };
  }
}

async function createUser({ email, password }) {
  try {
    const userRecord = await getAdminAuth().createUser({ email, password });
    return { ok: true, uid: userRecord.uid, email: userRecord.email };
  } catch (err) {
    return { ok: false, reason: "Could not create owner account: " + err.message };
  }
}

module.exports = { verifyIdToken, createUser, setAdminAuthForTesting, _resetAdminAuthForTesting };
