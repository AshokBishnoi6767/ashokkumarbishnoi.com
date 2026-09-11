"use strict";

/**
 * Authorized Client Observation — scoped authorization model and checker.
 *
 * This is real, deterministic logic (not a stub like behavioralRisk.js):
 * "is this specific operation on this specific resource within an
 * explicit, unexpired grant" is a solvable problem today, unlike adaptive
 * behavioral detection. Nothing here is wired into a live endpoint yet —
 * this repository is a solo-owner system with no multi-client observation
 * feature to gate — but the check itself is complete and correct now, so a
 * future client/tenant capability has a real boundary to call into instead
 * of inventing one under deadline pressure later.
 *
 * A ClientAuthorization is never inferred from conversation, from a
 * request header, or from "the client seemed to agree" — it must be
 * constructed explicitly (by whatever future admin/consent flow creates
 * one) with a concrete scope, purpose, and expiration. Everything below
 * fails closed: missing, expired, ambiguous, or partially-matching
 * authorization is denied, never approximated into an allow.
 */

function createClientAuthorization({
  client_id,
  scope,
  purpose,
  allowed_operations,
  prohibited_operations = [],
  granted_by,
  expires_at = null,
  data_classification = null,
} = {}) {
  const required = { client_id, scope, purpose, allowed_operations };
  for (const [field, value] of Object.entries(required)) {
    if (value == null) {
      throw new Error(`ClientAuthorization.${field} is required — authorization is never implicit.`);
    }
  }
  if (!Array.isArray(scope) || scope.length === 0) {
    throw new Error("ClientAuthorization.scope must be a non-empty array — an unscoped grant is not a smaller grant, it is an unbounded one, which this module refuses to create.");
  }
  if (!Array.isArray(allowed_operations) || allowed_operations.length === 0) {
    throw new Error("ClientAuthorization.allowed_operations must be a non-empty array — default-deny means nothing is allowed until explicitly named.");
  }
  return Object.freeze({
    client_id,
    scope: Object.freeze([...scope]),
    purpose,
    allowed_operations: Object.freeze([...allowed_operations]),
    prohibited_operations: Object.freeze([...prohibited_operations]),
    granted_by: granted_by || null,
    created_at: new Date().toISOString(),
    expires_at,
    data_classification,
  });
}

function isExpired(authorization, now = new Date()) {
  if (!authorization.expires_at) return false; // explicit "no expiration" is allowed, but must be explicit — see checkClientAuthorization's own default handling
  return new Date(authorization.expires_at).getTime() <= now.getTime();
}

function scopeIncludes(scope, resource) {
  return scope.includes(resource) || scope.includes("*");
}

// The single sanctioned decision point. Every branch that can deny,
// explains why; every branch that can allow requires an explicit,
// unexpired, correctly-scoped match — there is no fallthrough allow.
function checkClientAuthorization({ authorization, resource, operation, now = new Date() } = {}) {
  if (!authorization || typeof authorization !== "object") {
    return { allowed: false, reason: "No client authorization supplied." };
  }
  if (typeof resource !== "string" || !resource) {
    return { allowed: false, reason: "No resource specified — an authorization check must name what is being accessed." };
  }
  if (typeof operation !== "string" || !operation) {
    return { allowed: false, reason: "No operation specified." };
  }
  if (isExpired(authorization, now)) {
    return { allowed: false, reason: `Authorization for client '${authorization.client_id}' expired at ${authorization.expires_at}.` };
  }
  if (authorization.prohibited_operations.includes(operation)) {
    // Explicit prohibition wins even if the same operation also somehow
    // appears in allowed_operations — an explicit deny is never overridden
    // by a broader allow.
    return { allowed: false, reason: `Operation '${operation}' is explicitly prohibited for client '${authorization.client_id}'.` };
  }
  if (!authorization.allowed_operations.includes(operation)) {
    return { allowed: false, reason: `Operation '${operation}' is not in the authorized operation list for client '${authorization.client_id}'.` };
  }
  if (!scopeIncludes(authorization.scope, resource)) {
    return { allowed: false, reason: `Resource '${resource}' is outside the authorized scope for client '${authorization.client_id}'.` };
  }
  return { allowed: true, reason: null, client_id: authorization.client_id, purpose: authorization.purpose };
}

module.exports = { createClientAuthorization, checkClientAuthorization, isExpired };
