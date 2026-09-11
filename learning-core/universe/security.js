"use strict";

/**
 * Trinity Universe — Real Authorization Bridge (Security Hardening v0.1)
 *
 * protocol.js's createAuthorization() is explicitly "represented, not
 * enforced" — any caller can construct { granted: true } directly, and
 * every existing Universe test does exactly that as a fixture (see
 * universeProtocol.test.js, universePortalInvoke.test.js,
 * universeCommandCenter.test.js, etc.), which is correct for
 * unit-testing invocation mechanics in isolation from identity.
 *
 * That left a real gap: nothing in the Universe layer (commandCenter.js,
 * orchestrator.js, metaIntelligence.js) actually calls the EXISTING,
 * real authorization infrastructure (integration/auth/authorization.js,
 * live connection state, ownerAccount.isOwner()) before minting a
 * granted:true Authorization. Today that gap is inert — nothing in
 * server/index.js wires HTTP traffic into the Universe layer at all, so
 * it is unreachable — but the moment a future bot/portal IS wired to a
 * real request, a caller who reaches for createAuthorization() directly
 * gets a rubber stamp, not a check.
 *
 * This module is the missing other half: the ONE sanctioned bridge from
 * a server-verified Principal to a real Authorization. It never trusts
 * a caller-supplied identity claim ("I am the owner") — a Principal's
 * uid must independently check out against ownerAccount.isOwner(), the
 * exact same server-verified test server/index.js's authorizeOwnerRequest()
 * already performs for every real /api/ai request. A capability tied to
 * a real tool also still has to clear the EXISTING live-connection
 * authorization gate (integration/auth/authorization.js) — Universe
 * access is additive scaffolding on top of the Control Layer, never a
 * bypass of it.
 */

const { createAuthorization } = require("./protocol");
const { authorize: authorizeToolCapability } = require("../integration/auth/authorization");
const { getCapability } = require("../integration/registry/capabilities");
const ownerAccount = require("../integration/auth/ownerAccount");
const { AuthorityLevel } = require("../shared/constants");
const { recordSecurityEvent } = require("../integration/audit/securityLog");

// A Principal is the same server-verified shape server/index.js already
// derives from a verified Firebase ID token ({ kind: "owner", uid }) or
// from having no verified identity at all ({ kind: "public" }) — never a
// bare role/claim string, and never inferred from anything the caller
// merely asserts.
function resolvePrincipalAuthority(principal) {
  if (!principal || typeof principal !== "object" || typeof principal.kind !== "string") {
    return { level: null, reason: "No principal supplied, or not shaped as { kind, uid? } — a principal must come from server-verified identity, never be assumed." };
  }
  if (principal.kind === "owner") {
    if (!principal.uid || !ownerAccount.isOwner(principal.uid)) {
      return { level: null, reason: "Principal claims kind 'owner' but its uid does not match the verified owner account." };
    }
    return { level: AuthorityLevel.EXECUTE, reason: null };
  }
  if (principal.kind === "public") {
    // The lowest defined authority — enough to satisfy a portal that
    // explicitly opts into READ-level access (authorizationPolicy.
    // requiredLevel: "READ"), never enough to satisfy the EXECUTE-level
    // default every other portal requires (see portalInvoke.js's
    // default-deny).
    return { level: AuthorityLevel.READ, reason: null };
  }
  return { level: null, reason: `Unrecognized principal kind '${principal.kind}'.` };
}

// capabilityId, when supplied, ties this invocation to a real,
// tool-backed capability (integration/registry/capabilities.js) — the
// SAME live-connection/scope check runAction() already performs before
// executing an action applies here too, so Universe access can never
// reach a tool the Control Layer itself would refuse.
function authorizeUniverseInvocation({ principal, capabilityId = null, portalId = null } = {}) {
  const { level, reason } = resolvePrincipalAuthority(principal);
  if (!level) {
    recordSecurityEvent({
      event: "universe_authorization_denied",
      reason,
      portal_id: portalId,
      capability_id: capabilityId,
      principal_kind: principal && typeof principal === "object" ? principal.kind || null : null,
    });
    return createAuthorization({ granted: false, reason: reason || "Principal could not be authorized." });
  }

  if (capabilityId) {
    const capability = getCapability(capabilityId);
    // Unknown authorization fails closed: a capabilityId that does not
    // resolve to a registered capability (typo, forged id, stale
    // reference) must never silently skip the tool-authorization check
    // below — that would let a malformed/unrecognized capability_id
    // bypass the exact gate a real, registered capability would have to
    // clear.
    if (!capability) {
      const reason = `Unknown capability_id '${capabilityId}' — unrecognized authorization fails closed.`;
      recordSecurityEvent({
        event: "universe_authorization_denied",
        reason,
        portal_id: portalId,
        capability_id: capabilityId,
        principal_kind: principal.kind,
      });
      return createAuthorization({ granted: false, level, reason });
    }
    if (capability.tool_id) {
      const toolAuth = authorizeToolCapability(capability);
      if (!toolAuth.authorized) {
        recordSecurityEvent({
          event: "universe_authorization_denied",
          reason: toolAuth.reason,
          portal_id: portalId,
          capability_id: capabilityId,
          principal_kind: principal.kind,
        });
        return createAuthorization({ granted: false, level, reason: toolAuth.reason });
      }
    }
  }

  return createAuthorization({ granted: true, level, grantedBy: "universe.security", reason: null });
}

module.exports = { resolvePrincipalAuthority, authorizeUniverseInvocation };
