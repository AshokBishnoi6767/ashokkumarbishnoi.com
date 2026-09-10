"use strict";

/**
 * Trinity — Tool/Action Engine Integration v0.1 (M11)
 *
 * Does NOT modify integration/actions/lifecycle.js. That module already
 * implements the full action lifecycle the master spec's own diagram
 * asks for — CHECK CAPABILITY -> AUTHORIZE -> RISK/APPROVAL -> EXECUTE
 * -> OBSERVE -> independently VERIFY -> RECORD OUTCOME (audit) -> a
 * documented LEARN hook — and preserving existing authorization/risk
 * boundaries means this integration reads what that module already
 * produces rather than adding a second execution path, a shortcut
 * around confirmation, or any change to its control flow. Nothing in
 * this file can execute an action; it only interprets a record that
 * runAction()/finish() already returned.
 *
 * === What this file adds ===
 * A pure, read-only adapter from an action-lifecycle record's
 * ResultStatus vocabulary (shared/constants.js — EXPECTED/SUCCESS/
 * PARTIAL/FAILED/UNKNOWN/BLOCKED/RECOVERING, used for tool execution
 * outcomes) into this architecture's VerificationOutcome vocabulary
 * (VERIFIED/PARTIALLY_VERIFIED/CONTRADICTED/UNKNOWN/NOT_VERIFIABLE,
 * used for epistemic claim-checking — see verificationRealm.js). The
 * two vocabularies mean different things and are deliberately kept
 * separate everywhere else in this codebase (see verificationRealm.js's
 * own module doc); this bridge is the one explicit, documented place
 * they are related, not a silent merge.
 *
 * Mapping, each justified individually — never a blanket default:
 *   SUCCESS + verified:true   -> VERIFIED    (independently confirmed,
 *                                              exactly what lifecycle.js's
 *                                              own "a provider claiming
 *                                              success is never itself
 *                                              SUCCESS" rule already
 *                                              guards — verified must be
 *                                              true, not just result).
 *   SUCCESS + verified:false  -> UNKNOWN      (claimed success with no
 *                                              independent confirmation
 *                                              behind it — same honesty
 *                                              rule, enforced again here).
 *   PARTIAL                   -> PARTIALLY_VERIFIED
 *   FAILED                    -> CONTRADICTED (the action was attempted
 *                                              and independently found
 *                                              not to have happened —
 *                                              real contrary evidence,
 *                                              not mere absence of info).
 *   BLOCKED                   -> NOT_VERIFIABLE (never executed — nothing
 *                                              to check in principle).
 *   UNKNOWN / RECOVERING / EXPECTED -> UNKNOWN (inconclusive or not yet
 *                                              a terminal outcome).
 *
 * recordActionAsFeedback() feeds an action record into the existing
 * Feedback Engine (learning/feedbackLoop.js) as one cycle — this is
 * opt-in, called by whatever caller already has the action record in
 * hand; it does not hook into lifecycle.js#finish() itself (see the
 * Feedback Engine milestone's own note on why that wiring is a
 * separate, deliberately deferred decision).
 */

const { ResultStatus, VerificationOutcome } = require("../../shared/constants");
const { recordFeedback } = require("../../learning/feedbackLoop");

function actionRecordToVerificationOutcome(actionRecord) {
  if (!actionRecord || typeof actionRecord.result !== "string") {
    throw new TypeError("actionRecordToVerificationOutcome requires an action-lifecycle record with a `result` field.");
  }

  let outcome;
  let reason;
  switch (actionRecord.result) {
    case ResultStatus.SUCCESS:
      if (actionRecord.verified) {
        outcome = VerificationOutcome.VERIFIED;
        reason = "Action result SUCCESS with an independent verify() confirmation.";
      } else {
        outcome = VerificationOutcome.UNKNOWN;
        reason = "Action result SUCCESS but not independently verified — a provider's own claim is never itself confirmation.";
      }
      break;
    case ResultStatus.PARTIAL:
      outcome = VerificationOutcome.PARTIALLY_VERIFIED;
      reason = "Action result PARTIAL.";
      break;
    case ResultStatus.FAILED:
      outcome = VerificationOutcome.CONTRADICTED;
      reason = "Action result FAILED — independently found not to have happened.";
      break;
    case ResultStatus.BLOCKED:
      outcome = VerificationOutcome.NOT_VERIFIABLE;
      reason = "Action was blocked before execution; there is nothing to verify.";
      break;
    default:
      outcome = VerificationOutcome.UNKNOWN;
      reason = `Action result ${actionRecord.result} is not a terminal, conclusive outcome.`;
  }

  return {
    action_id: actionRecord.action_id,
    outcome,
    reason,
    provenance: {
      realm: "TOOL_ACTION_INTEGRATION",
      source_result: actionRecord.result,
      source_verified: !!actionRecord.verified,
      mapped_at: new Date().toISOString(),
    },
  };
}

// Feeds an already-produced action record into the Feedback Engine as
// one cycle. `estimate` is what the caller expected before execution
// (defaults to ResultStatus.SUCCESS, the ordinary expectation when an
// action is requested at all); `matched` is true only for a truly
// confirmed success (SUCCESS + verified), matching the mapping above.
function recordActionAsFeedback(actionRecord, { estimate = ResultStatus.SUCCESS, currentState = null } = {}) {
  if (!actionRecord || typeof actionRecord.result !== "string") {
    throw new TypeError("recordActionAsFeedback requires an action-lifecycle record with a `result` field.");
  }
  const matched = actionRecord.result === ResultStatus.SUCCESS && !!actionRecord.verified;
  return recordFeedback({
    input: { capability: actionRecord.capability, why: actionRecord.why },
    estimate,
    output: actionRecord.result,
    matched,
    evidence: actionRecord,
    currentState,
  });
}

module.exports = { actionRecordToVerificationOutcome, recordActionAsFeedback };
