"use strict";

/**
 * Deception / Quarantine Realm — INTERFACE ONLY, per the Trinity security
 * mandate. There is no real risk engine, isolated synthetic environment,
 * or evidence pipeline behind this module. It exists so a future
 * implementation has a fixed contract to fill in, and so nothing in this
 * codebase can quietly claim quarantine/deception protection that isn't
 * real.
 *
 * The intended pipeline, once real infrastructure exists:
 *
 *   SUSPECT -> RISK ENGINE -> QUARANTINE -> ISOLATED SYNTHETIC ENVIRONMENT
 *   -> OBSERVATION -> EVIDENCE -> DECISION
 *
 * "RISK ENGINE" here would need real signals this codebase does not
 * collect today (see behavioralRisk.js — the same honest gap). Even once
 * a risk engine exists, the isolated environment itself is a genuine
 * infrastructure build: a synthetic environment that is provably isolated
 * from production data, credentials, and destructive tools, with its own
 * audited observation/evidence pipeline. None of that can be honestly
 * simulated by a function that just returns a canned answer.
 *
 * Hard constraints on any FUTURE real implementation (never to be
 * violated, stated here so they survive into whatever eventually replaces
 * this stub):
 *   - the isolated environment MUST NEVER contain real credentials, real
 *     secrets, real customer data, or the owner's private memory
 *   - the isolated environment MUST NEVER hold a destructive tool or
 *     unrestricted external network access
 *   - this system defends via isolation/denial/revocation/quarantine/
 *     evidence/recovery — it NEVER hacks back, retaliates, or compromises
 *     an external system, regardless of how it is invoked
 *
 * Nothing in this codebase currently calls this module.
 */

const STATUS = Object.freeze({ NOT_AVAILABLE: "NOT_AVAILABLE" });

function routeToQuarantine(_suspectContext) {
  return Object.freeze({
    status: STATUS.NOT_AVAILABLE,
    quarantined: false,
    reason:
      "No real risk engine or isolated synthetic environment exists yet. A caller MUST treat this as 'quarantine could not be performed' — never as 'the suspect was cleared' and never as 'proceed normally.'",
  });
}

// Symmetric to behavioralRisk.js's isCleared(): fails closed against
// every input, including a forged/unrecognized status paired with a
// forged quarantined:false or evidence-looks-clean field, because no real
// status other than NOT_AVAILABLE can exist until real infrastructure is
// built and validated.
function isDecisionTrustworthy(_decision) {
  return false;
}

module.exports = { routeToQuarantine, isDecisionTrustworthy, STATUS };
