"use strict";

/**
 * Adaptive-attacker / behavioral-impersonation risk assessment — INTERFACE
 * ONLY. There is no real detection capability behind this module today.
 *
 * Why this exists as a stub rather than not existing at all: the Trinity
 * security mandate asks how the system defends against an attacker who has
 * learned the real owner's behavioral patterns (phrasing, timing, request
 * shape) closely enough to pass every identity/authorization check this
 * codebase can actually perform (verified Firebase uid match — see
 * universe/security.js#resolvePrincipalAuthority). A correct verified uid
 * is real proof of session possession; it is NOT proof the human typing is
 * still the owner (a stolen/replayed session, a coerced owner, or an
 * AI-agent-in-the-loop mimicking the owner's style would all pass it).
 * Closing that gap needs something no code change alone can provide:
 *
 *   - a real telemetry pipeline (request timing/velocity, phrasing/
 *     stylometric features, device/session fingerprints, geographic/
 *     network signals) collected over time per-owner,
 *   - a genuine historical baseline model of the owner's own behavior,
 *     trained and validated against real usage, not synthetic data,
 *   - an anomaly-scoring method with a measured false-positive rate low
 *     enough that the owner isn't routinely locked out of their own
 *     account, validated the same way every other claim in this codebase
 *     must be (see learning/candidatePipeline.js's sandbox -> promote
 *     gate) before it can gate anything real,
 *   - a human review/escalation path for whatever it flags, since an
 *     automated system has no basis to unilaterally decide "this is not
 *     really the owner" and act on that alone.
 *
 * None of that exists in this repository. Building a function that
 * RETURNS a risk score without any of the above would be exactly the
 * "manufactured fake detection capability" the mandate explicitly warns
 * against — worse than having nothing, because a fabricated score invites
 * something downstream to trust it.
 *
 * So this module does the one honest thing available: it names the gap,
 * and enforces FAIL-CLOSED semantics for anything that might someday call
 * it. A caller MUST treat NOT_AVAILABLE as "no additional trust may be
 * extended on this basis" — never as "so skip this check" or "so assume
 * low risk." Nothing in this codebase currently calls this function; the
 * owner-uid check remains the real (and only) identity boundary today.
 */

// NOT_AVAILABLE is the only status this module can honestly produce today.
// LOW/MEDIUM/HIGH are named here so a future real implementation has a
// fixed contract to fill in — they must never be treated as already valid
// input, which is why isCleared() below allowlists against REAL_STATUSES
// (currently empty) rather than merely excluding NOT_AVAILABLE.
const STATUS = Object.freeze({ NOT_AVAILABLE: "NOT_AVAILABLE", LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" });
const REAL_STATUSES = Object.freeze([]); // populated only once a real, validated assessment exists

function assessBehavioralRisk(_context) {
  return Object.freeze({
    status: STATUS.NOT_AVAILABLE,
    risk: null,
    reason:
      "Behavioral/adaptive-attacker risk assessment is not implemented. This is not a low-risk or neutral result — callers must treat it as an unresolved gate, never as a pass.",
  });
}

// A caller integrating this in the future must fail closed on anything
// other than a real, validated LOW verdict this module cannot yet produce.
// Deliberately an allowlist against REAL_STATUSES (today empty), not a
// blocklist of just NOT_AVAILABLE — a blocklist would let ANY other status
// string (forged, mistyped, or from a not-yet-validated future code path)
// through as long as risk happened to say "LOW". This helper exists so
// that logic is written once, correctly, rather than re-derived (and
// potentially gotten wrong) at every call site.
function isCleared(assessment) {
  return !!assessment && REAL_STATUSES.includes(assessment.status) && assessment.risk === STATUS.LOW;
}

module.exports = { assessBehavioralRisk, isCleared, STATUS };
