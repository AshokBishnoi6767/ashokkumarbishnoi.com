"use strict";

const { newMemoryId } = require("../shared/ids");

function createLearningEvent({ trigger, evidence, diagnosis, appliesTo = "conversation", sourceActionId }) {
  return {
    learning_event_id: newMemoryId(),
    trigger, // e.g. "user_correction" | "action_outcome" | "verification_mismatch"
    evidence,
    diagnosis: diagnosis || null,
    applies_to: appliesTo, // "conversation" scope by default; "persistent" requires explicit promotion
    promoted_to_persistent: false,
    source_action_id: sourceActionId || null,
    created_at: new Date().toISOString(),
  };
}

// A user correction is a CANDIDATE learning event — never automatically
// promoted to persistent memory/truth.
function recordCorrection({ previousClaim, correction, source }) {
  return createLearningEvent({
    trigger: "user_correction",
    evidence: { previous_claim: previousClaim, correction, source },
    diagnosis: "Requires review before promotion to persistent memory.",
    appliesTo: "conversation",
  });
}

module.exports = { createLearningEvent, recordCorrection };
