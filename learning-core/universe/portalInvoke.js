"use strict";

/**
 * Trinity Universe — Portal Invocation Engine v0.1
 *
 * Implements the invocation lifecycle from the spec:
 *
 *   REQUEST -> RESOLVE -> AUTHORIZE -> PLAN -> EXECUTE -> OBSERVE
 *   -> VERIFY -> RESULT
 *
 * This is the ONLY place in the Universe layer that actually calls a
 * realm's `execute` function — registry.js is discovery-only by design
 * (see its own module doc), and this file is where that separation is
 * enforced: nothing runs merely because a portal/realm exists in the
 * registry, only because RESOLVE found it, AUTHORIZE approved it, and
 * the realm's own declared status says it is genuinely executable.
 *
 * === Authorization is reused, not reinvented (Phase 19) ===
 * invokePortal() trusts NOTHING about identity/role on its own. It
 * requires the caller to already have produced an Authorization object
 * (protocol.js#createAuthorization) via the EXISTING action-lifecycle/
 * safety infrastructure elsewhere in this codebase — a request whose
 * `authorization.granted` is not `=== true` is refused before EXECUTE
 * ever runs, with status UNAUTHORIZED. A portal's own
 * `authorizationPolicy.requiredLevel` (if set) is additionally checked
 * against the supplied authorization's `level`.
 *
 * === execute()'s return shape ===
 * A realm's `execute(input, { context })` may return either:
 *   (a) a bare value — becomes PortalResult.result, with the honest
 *       defaults (truth_state UNKNOWN, confidence null, probability
 *       NOT_DEFINED, uncertainty PRESENT — nothing here upgrades them), or
 *   (b) an object carrying any of { result, truth_state, confidence,
 *       probability, uncertainty, verification, evidence, actions,
 *       artifacts } — only the fields actually present override the
 *       same honest defaults; this module never invents a missing one.
 * A thrown error, or a realm/portal that cannot honestly execute,
 * becomes PortalResultStatus.ERROR / NOT_IMPLEMENTED / UNAUTHORIZED —
 * never a fabricated RESULT.
 */

const { realmRegistry, portalRegistry } = require("./registry");
const { PortalResultStatus, createPortalResult } = require("./protocol");
const { PortalStatus, RealmStatus, TruthState, ProbabilityStatus, UncertaintyStatus } = require("../shared/constants");

const EXECUTABLE_REALM_STATUSES = [RealmStatus.EXPERIMENTAL, RealmStatus.IMPLEMENTED, RealmStatus.VERIFIED, RealmStatus.PRODUCTION_READY];

function unresolvedResult(requestId, portalId, reason) {
  return createPortalResult({ requestId, portalId, realmId: "unresolved", status: PortalResultStatus.ERROR, reason });
}

function unwrapExecuteOutput(output) {
  const isPlainResultObject =
    output && typeof output === "object" && !Array.isArray(output) &&
    ["result", "truth_state", "confidence", "probability", "uncertainty", "verification", "evidence", "actions", "artifacts", "interpretation"].some((k) => k in output);

  if (isPlainResultObject) {
    return {
      interpretation: output.interpretation ?? null,
      result: "result" in output ? output.result : null,
      truth_state: output.truth_state ?? TruthState.UNKNOWN,
      confidence: output.confidence ?? null,
      probability: output.probability ?? ProbabilityStatus.NOT_DEFINED,
      uncertainty: output.uncertainty ?? UncertaintyStatus.PRESENT,
      verification: output.verification ?? null,
      evidence: output.evidence ?? [],
      actions: output.actions ?? [],
      artifacts: output.artifacts ?? [],
    };
  }

  return {
    interpretation: null,
    result: output,
    truth_state: TruthState.UNKNOWN,
    confidence: null,
    probability: ProbabilityStatus.NOT_DEFINED,
    uncertainty: UncertaintyStatus.PRESENT,
    verification: null,
    evidence: [],
    actions: [],
    artifacts: [],
  };
}

async function invokePortal(portalRequest) {
  const requestId = portalRequest.id;

  // RESOLVE
  const portal = portalRegistry.get(portalRequest.portalId);
  if (!portal) {
    return unresolvedResult(requestId, portalRequest.portalId, `No portal registered with id '${portalRequest.portalId}'.`);
  }

  if (portal.status !== PortalStatus.ACTIVE) {
    return createPortalResult({
      requestId,
      portalId: portal.id,
      realmId: portal.realmId,
      status: PortalResultStatus.NOT_IMPLEMENTED,
      reason: `Portal '${portal.id}' has status ${portal.status}, not ACTIVE.`,
    });
  }

  const realm = realmRegistry.get(portal.realmId);
  if (!realm) {
    return createPortalResult({
      requestId,
      portalId: portal.id,
      realmId: portal.realmId,
      status: PortalResultStatus.ERROR,
      reason: `Portal '${portal.id}' references unregistered realm '${portal.realmId}'.`,
    });
  }

  // AUTHORIZE — refuse before ever touching EXECUTE. A caller-supplied
  // role/identity string is never itself sufficient; only an explicit
  // `granted: true` Authorization object (built by existing
  // authorization infrastructure upstream of this call) passes.
  const authorization = portalRequest.authorization;
  if (!authorization || authorization.granted !== true) {
    return createPortalResult({
      requestId,
      portalId: portal.id,
      realmId: realm.id,
      status: PortalResultStatus.UNAUTHORIZED,
      reason: authorization?.reason || "No granted authorization was supplied with this request.",
    });
  }
  if (portal.authorizationPolicy?.requiredLevel && authorization.level !== portal.authorizationPolicy.requiredLevel) {
    return createPortalResult({
      requestId,
      portalId: portal.id,
      realmId: realm.id,
      status: PortalResultStatus.UNAUTHORIZED,
      reason: `Portal '${portal.id}' requires authorization level ${portal.authorizationPolicy.requiredLevel}, got ${authorization.level}.`,
    });
  }

  // PLAN — trivial for a single-portal invocation; a multi-portal plan
  // is orchestrator.js's job, not this function's.

  // EXECUTE / OBSERVE
  if (!EXECUTABLE_REALM_STATUSES.includes(realm.status) || typeof realm.execute !== "function") {
    return createPortalResult({
      requestId,
      portalId: portal.id,
      realmId: realm.id,
      status: PortalResultStatus.NOT_IMPLEMENTED,
      reason: `Realm '${realm.id}' has status ${realm.status} — no real execution path exists yet. Honest UNKNOWN, not a fabricated result.`,
    });
  }

  let rawOutput;
  try {
    rawOutput = await Promise.resolve(realm.execute(portalRequest.request, { context: portalRequest.context }));
  } catch (err) {
    return createPortalResult({
      requestId,
      portalId: portal.id,
      realmId: realm.id,
      status: PortalResultStatus.ERROR,
      reason: `Realm '${realm.id}' execution threw: ${err.message}`,
    });
  }

  // VERIFY — this function passes through whatever verification the
  // realm's own execute() already attached (e.g. a math realm calling
  // verifyMathClaim internally); it never fabricates a NEW verification
  // verdict here. Cross-realm verification across MULTIPLE portals'
  // results is orchestrator.js's crossRealmVerify(), not this one.
  const unwrapped = unwrapExecuteOutput(rawOutput);

  // RESULT
  return createPortalResult({
    requestId,
    portalId: portal.id,
    realmId: realm.id,
    status: PortalResultStatus.RESULT,
    ...unwrapped,
    executionMetadata: { realm_status: realm.status },
  });
}

module.exports = { invokePortal, unwrapExecuteOutput };
