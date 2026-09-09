"use strict";

const { AuthState } = require("../../shared/constants");

// In-memory placeholder. A real build replaces this with a Firestore state
// document per tool (status/scopes/expiry) plus Secret Manager for the
// actual token value — this file never holds a real secret.
const STATE = new Map([
  ["mock", { status: AuthState.AUTHORIZED, scopes: ["read", "write"], expires_at: null }],
  ["website", { status: AuthState.DISCONNECTED, scopes: [], expires_at: null }],
  ["calendly", { status: AuthState.DISCONNECTED, scopes: [], expires_at: null }],
  ["hubspot", { status: AuthState.DISCONNECTED, scopes: [], expires_at: null }],
  ["google_calendar", { status: AuthState.DISCONNECTED, scopes: [], expires_at: null }],
  ["gmail", { status: AuthState.DISCONNECTED, scopes: [], expires_at: null }],
  ["whatsapp", { status: AuthState.DISCONNECTED, scopes: [], expires_at: null }],
  ["linkedin", { status: AuthState.DISCONNECTED, scopes: [], expires_at: null }],
]);

function getAuthState(toolId) {
  return STATE.get(toolId) || { status: AuthState.DISCONNECTED, scopes: [], expires_at: null };
}

function isAuthorizedFor(toolId, _capabilityId) {
  const state = getAuthState(toolId);
  return state.status === AuthState.AUTHORIZED || state.status === AuthState.PARTIALLY_AUTHORIZED;
}

module.exports = { getAuthState, isAuthorizedFor };
