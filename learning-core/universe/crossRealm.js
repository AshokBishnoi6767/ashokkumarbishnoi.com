"use strict";

/**
 * Trinity Universe — Cross-Realm Communication & Verification v0.1
 *
 * Phase 8: a realm never mutates another realm's internal state
 * directly. sendRealmMessage() is the only path from a RealmMessage to
 * an actual computation, and it goes through the exact same
 * invokePortal() every other caller uses — a realm has no back door.
 *
 * Phase 17: crossRealmVerify() compares results ALREADY PRODUCED by
 * different realms/portals. It never re-runs anything and never
 * silently prefers one realm's answer over another's — agreement
 * becomes VERIFIED, disagreement becomes CONFLICTING_RESULTS with both
 * sources preserved, and too little successful data to compare becomes
 * UNKNOWN. The default comparison (structural equality) is
 * intentionally crude; a caller doing numeric or semantic comparison
 * should supply its own `compare` function rather than have one
 * invented here.
 */

const { createPortalRequest, createVerificationResult } = require("./protocol");
const { invokePortal } = require("./portalInvoke");
const { VerificationOutcome } = require("../shared/constants");

async function sendRealmMessage(message) {
  const request = createPortalRequest({
    portalId: message.targetPortal,
    request: message.payload,
    context: message.context,
    constraints: message.constraints,
    authorization: message.authorization,
  });
  const result = await invokePortal(request);
  return { message, result };
}

function defaultCompare(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function crossRealmVerify(portalResults, { compare = defaultCompare } = {}) {
  if (!Array.isArray(portalResults) || portalResults.length === 0) {
    return createVerificationResult({ status: VerificationOutcome.UNKNOWN, sources: [], reason: "No results supplied to compare." });
  }

  const asSource = (r) => ({ realmId: r.realmId, portalId: r.portalId, status: r.status, result: r.result });
  const successful = portalResults.filter((r) => r.status === "RESULT");

  if (successful.length < 2) {
    return createVerificationResult({
      status: VerificationOutcome.UNKNOWN,
      sources: portalResults.map(asSource),
      reason: "Fewer than two successful realm results were supplied; nothing independent to cross-check against.",
    });
  }

  const [first, ...rest] = successful;
  const allAgree = rest.every((r) => compare(r.result, first.result));

  return createVerificationResult({
    status: allAgree ? VerificationOutcome.VERIFIED : VerificationOutcome.CONFLICTING_RESULTS,
    sources: successful.map(asSource),
    reason: allAgree ? null : "Independently-produced results from different realms disagree; neither is discarded.",
  });
}

module.exports = { sendRealmMessage, crossRealmVerify };
