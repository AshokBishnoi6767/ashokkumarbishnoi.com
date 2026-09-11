"use strict";

// Deterministic Firebase Admin Auth double for the automated test suite —
// same precedent as testCalendarConnector.js and the null model provider:
// fast, hermetic, no external process. It is injected via
// firebaseAdmin.setAdminAuthForTesting() and models the real security
// property that matters for these tests: a bearer token is only ever valid
// if it was actually issued by this "auth service" for a real user — an
// attacker-supplied arbitrary string (e.g. a raw uid, or JSON they made up)
// is never accepted, exactly like a forged/unsigned JWT would be rejected
// by the real Admin SDK.
//
// A separate, one-time manual verification against the REAL Firebase Auth
// emulator (documented in the final report) proves the actual wiring in
// firebaseAdmin.js/server/index.js works against genuine Firebase ID
// tokens, not just this double.
let users = new Map(); // uid -> { uid, email }
let tokens = new Map(); // token -> uid
let expiredTokens = new Set(); // token strings that must verify as expired, not just unknown
let counter = 0;

async function createUser({ email, password }) {
  if (!email || !password) {
    const err = new Error("email and password are required.");
    throw err;
  }
  for (const u of users.values()) {
    if (u.email === email) {
      throw new Error("The email address is already in use by another account.");
    }
  }
  const uid = "test-uid-" + ++counter;
  users.set(uid, { uid, email });
  return { uid, email };
}

async function verifyIdToken(token) {
  if (expiredTokens.has(token)) {
    // Mirrors the real Admin SDK's distinct "auth/id-token-expired" failure
    // for a token that WAS validly issued but has since expired — a
    // different failure mode than "never issued at all" (forged).
    throw new Error("Firebase ID token has expired.");
  }
  const uid = tokens.get(token);
  if (!uid) {
    throw new Error("Invalid or forged token.");
  }
  const user = users.get(uid);
  return { uid: user.uid, email: user.email };
}

// Test-only: mint a token for a uid, standing in for what a real
// signInWithEmailAndPassword() would return client-side after createUser().
function issueTokenForUid(uid) {
  if (!users.has(uid)) throw new Error("No such test user: " + uid);
  const token = "test-token-" + uid + "-" + Math.random().toString(36).slice(2);
  tokens.set(token, uid);
  return token;
}

// Test-only: same, looked up by email — convenient when a test only has
// the email back from a real endpoint response (e.g. setup-owner), not the
// uid directly, mirroring how a real client would sign in by email.
function issueTokenForEmail(email) {
  const user = Array.from(users.values()).find((u) => u.email === email);
  if (!user) throw new Error("No such test user with email: " + email);
  return issueTokenForUid(user.uid);
}

// Test-only: mint a token that verifies as EXPIRED, not merely unknown —
// distinct failure mode from a forged/never-issued token.
function issueExpiredTokenForUid(uid) {
  const token = issueTokenForUid(uid);
  expiredTokens.add(token);
  return token;
}

function getUidForEmail(email) {
  const user = Array.from(users.values()).find((u) => u.email === email);
  return user ? user.uid : null;
}

// Test-only: register a second user directly (simulating "some other
// Firebase user exists") without going through the owner-setup endpoint.
function registerUser(uid, email) {
  users.set(uid, { uid, email });
}

// Deliberately does NOT reset the uid counter — each test in a shared
// process gets a globally unique owner uid across the whole file, so a
// leftover record from one test's owner scope can never bleed into
// another test's freshly-created owner scope after a reset.
function reset() {
  users = new Map();
  tokens = new Map();
  expiredTokens = new Set();
}

module.exports = { createUser, verifyIdToken, issueTokenForUid, issueTokenForEmail, issueExpiredTokenForUid, getUidForEmail, registerUser, reset };
