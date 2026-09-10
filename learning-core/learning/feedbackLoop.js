"use strict";

/**
 * Trinity — Feedback Engine v0.1 (M9)
 *
 * Represents the closed loop the spec asks for instead of a bare
 * INPUT -> OUTPUT:
 *
 *   INPUT -> ESTIMATE -> OUTPUT -> FEEDBACK -> UPDATED STATE -> NEXT INPUT
 *
 * recordFeedback() takes one cycle's input/estimate/output plus an
 * explicit, caller-decided `matched` boolean (this module never
 * infers "did it match" itself — that judgment belongs to whatever
 * mechanism actually checked it: Verification Realm's verifyClaim,
 * the existing action lifecycle's own `verified` flag
 * (integration/actions/lifecycle.js), or a human) and produces a
 * FeedbackCycle plus an updated running state.
 *
 * === Closes a real, previously-documented gap ===
 * integration/actions/lifecycle.js#finish() already carries this exact
 * comment: "LEARN: in the full Learning Core this writes a learning
 * event into Memory. Not implemented here — see
 * learning-core/learning/events.js, which the caller may invoke with
 * this record as evidence." feedbackToLearningCandidate() is that
 * mechanism: a MISMATCH cycle produces a learning/events.js
 * createLearningEvent (trigger "verification_mismatch", one of the
 * exact trigger strings events.js's own comment already names) as a
 * CANDIDATE — never auto-promoted, same discipline recordCorrection()
 * already established.
 *
 * This module does NOT modify integration/actions/lifecycle.js. Wiring
 * this into that file's actual call sites — so every real action
 * executed by the live app also produces a feedback cycle — is a
 * deliberately separate, deferred step: it changes behavior on every
 * production action execution path and deserves explicit review
 * before being wired in, not a change bundled quietly into this
 * milestone. What this milestone proves is that the mechanism exists,
 * is tested, and accepts a real lifecycle.js-shaped record as its
 * `evidence` — see the test using exactly that shape.
 *
 * === Updated state is an explicit running tally, not fabricated parameters ===
 * There is no trainable numeric parameter in this codebase yet (see
 * learning/candidatePipeline.js's module doc), so "updated_state" here
 * is a plain, auditable count of cycles/confirmations/mismatches —
 * never a fabricated confidence score or parameter adjustment. The day
 * a real parameterized transformation exists, its state update would
 * route through math/engine.js's gradientDescentStep, not through an
 * invented number here.
 */

const { newMemoryId } = require("../shared/ids");
const { createLearningEvent } = require("./events");

function initialState() {
  return { cycles: [], confirmed_count: 0, mismatch_count: 0 };
}

function recordFeedback({ input, estimate, output, matched, evidence = null, currentState = null }) {
  if (typeof matched !== "boolean") {
    throw new TypeError("recordFeedback requires an explicit boolean `matched` — this module never infers whether the estimate matched.");
  }
  const state = currentState || initialState();
  const id = newMemoryId();
  const feedback = matched ? "CONFIRMED" : "MISMATCH";

  const updated_state = {
    cycles: [...state.cycles, id],
    confirmed_count: state.confirmed_count + (matched ? 1 : 0),
    mismatch_count: state.mismatch_count + (matched ? 0 : 1),
  };

  return {
    id,
    input,
    estimate,
    output,
    feedback,
    evidence,
    previous_state: state,
    updated_state,
    provenance: {
      realm: "FEEDBACK",
      created_at: new Date().toISOString(),
    },
  };
}

// A MISMATCH cycle becomes a Learning Engine CANDIDATE (see
// learning/events.js) — never auto-promoted. A CONFIRMED cycle
// produces no correction to learn from, so this returns null (there is
// nothing to sandbox; confirmation is still visible in updated_state's
// confirmed_count, it just isn't a learning candidate).
function feedbackToLearningCandidate(feedbackCycle) {
  if (!feedbackCycle || !feedbackCycle.id) {
    throw new TypeError("feedbackToLearningCandidate requires a FeedbackCycle (see recordFeedback).");
  }
  if (feedbackCycle.feedback !== "MISMATCH") return null;

  return createLearningEvent({
    trigger: "verification_mismatch",
    evidence: {
      input: feedbackCycle.input,
      estimate: feedbackCycle.estimate,
      output: feedbackCycle.output,
      detail: feedbackCycle.evidence,
    },
    diagnosis: "Estimate did not match the verified/observed outcome; requires review before promotion.",
    appliesTo: "conversation",
  });
}

module.exports = { initialState, recordFeedback, feedbackToLearningCandidate };
