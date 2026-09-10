"use strict";

/**
 * Trinity — Safety / Constraint Engine v0.1 (M12)
 *
 * The action-side safety machinery already exists and is untouched:
 * integration/auth/authorization.js (capability-level authorization,
 * live connection state — never the model's own say-so), lifecycle.js
 * (HIGH/CRITICAL risk always forces explicit confirmation regardless
 * of the registry's requires_confirmation flag, proposal != execution),
 * integration/credentials/reference.js (describe() never leaks a raw
 * secret), and shared/logger.js (redacts secret-shaped fields). This
 * milestone does not rebuild or weaken any of that — see security.test.js,
 * still passing unchanged.
 *
 * What this file adds is the CLAIM side of "every claim should respect
 * evidence, provenance, epistemic status" (master spec section 18),
 * composed from realms already built rather than new logic duplicating
 * them: checkProvenance() (Verification Realm, M4) for structural
 * completeness, plus an explicit fabrication check this milestone adds
 * — a numeric `probability` with no PROBABILITY_UNCERTAINTY provenance
 * attached is flagged as a possible fabrication, regardless of how the
 * claim reached this check. probabilityRealm.js's assignProbability()
 * is the only sanctioned way to attach that provenance; this is the
 * independent AUDIT that a claim actually went through it, not a
 * second gate a caller could bypass by skipping assignProbability and
 * writing `probability` directly (that was always technically possible
 * in plain JS — this function is what makes doing so DETECTABLE).
 *
 * checkActionSafety() is the equivalent audit for an action-lifecycle
 * record: required fields present, action_status is a real
 * ActionStatus value, and — the one active defensive check, not just a
 * presence check — a record cannot claim `verified: true` with no
 * `action_ref`, since lifecycle.js's own verify() step requires a real
 * action_ref to check against (see its "nothing to verify" branch).
 * A record failing that combination did not come from an honest
 * runAction() call.
 *
 * Neither function executes anything, authorizes anything, or blocks
 * anything by itself — both are read-only audits a caller uses before
 * trusting/surfacing/acting on a claim or action record from anywhere,
 * including ones that did not originate inside this codebase's own
 * pipeline.
 */

const { checkProvenance } = require("../../language/realm/verificationRealm");
const { TruthState, ActionStatus } = require("../../shared/constants");

function checkClaimSafety(claim) {
  if (!claim || typeof claim !== "object") {
    return { safe: false, violations: ["Claim is missing or not an object."] };
  }

  const violations = [];

  const provenanceCheck = checkProvenance(claim);
  if (!provenanceCheck.complete) {
    violations.push(...provenanceCheck.missing.map((m) => `Incomplete provenance: ${m}`));
  }

  if (typeof claim.probability === "number") {
    const justified = claim.probability_provenance && claim.probability_provenance.realm === "PROBABILITY_UNCERTAINTY";
    if (!justified) {
      violations.push("Numeric probability present without PROBABILITY_UNCERTAINTY provenance — possible fabrication.");
    }
  }

  if (claim.truth_state !== undefined && !Object.values(TruthState).includes(claim.truth_state)) {
    violations.push(`truth_state "${claim.truth_state}" is not a recognized TruthState value.`);
  }

  return { safe: violations.length === 0, violations };
}

function checkActionSafety(actionRecord) {
  if (!actionRecord || typeof actionRecord !== "object") {
    return { safe: false, violations: ["Action record is missing or not an object."] };
  }

  const violations = [];
  for (const field of ["action_id", "capability", "action_status", "result"]) {
    if (actionRecord[field] === undefined) violations.push(`Missing required field: ${field}`);
  }

  if (actionRecord.action_status !== undefined && !Object.values(ActionStatus).includes(actionRecord.action_status)) {
    violations.push(`action_status "${actionRecord.action_status}" is not a recognized ActionStatus value.`);
  }

  if (actionRecord.verified === true && !actionRecord.action_ref) {
    violations.push("Marked verified:true but has no action_ref — an honest verify() step always requires something to have verified.");
  }

  return { safe: violations.length === 0, violations };
}

module.exports = { checkClaimSafety, checkActionSafety };
