"use strict";

// The single-owner boundary: exactly one account may ever be the private
// owner. Persisted via fileStore so this survives a restart — otherwise a
// process restart would silently re-open owner setup to anyone. This
// module never sees a password; it only ever records a uid/email that
// Firebase itself has already authenticated.
const fileStore = require("../../persistence/fileStore");

const COLLECTION = "owner_account";
const EMPTY_STATE = { owner_uid: null, owner_email: null, created_at: null };

function load() {
  return fileStore.load(COLLECTION, EMPTY_STATE);
}

function getOwnerState() {
  return load();
}

function isOwnerConfigured() {
  return !!load().owner_uid;
}

// Idempotent guard: the FIRST call wins. Any later call — even with a
// different uid — is rejected. This is the entire "no public registration
// after the owner exists" boundary, enforced server-side rather than by
// hiding a button in the frontend (which the instructions explicitly
// disallow relying on).
function setupOwner({ uid, email }) {
  const state = load();
  if (state.owner_uid) {
    return { ok: false, reason: "Owner account already configured." };
  }
  const record = { owner_uid: uid, owner_email: email || null, created_at: new Date().toISOString() };
  fileStore.save(COLLECTION, record);
  return { ok: true, state: record };
}

function isOwner(uid) {
  const state = load();
  return !!uid && state.owner_uid === uid;
}

function _reset() {
  fileStore.save(COLLECTION, EMPTY_STATE);
}

module.exports = { getOwnerState, isOwnerConfigured, setupOwner, isOwner, _reset };
