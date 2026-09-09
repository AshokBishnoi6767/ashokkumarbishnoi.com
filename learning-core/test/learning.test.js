"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLearningEvent, recordCorrection } = require("../learning/events");

test("learning: creates a learning event tied to its triggering action", () => {
  const event = createLearningEvent({
    trigger: "verification_mismatch",
    evidence: { expected: "SUCCESS", actual: "UNKNOWN" },
    sourceActionId: "action-42",
  });
  assert.equal(event.trigger, "verification_mismatch");
  assert.equal(event.source_action_id, "action-42");
  assert.ok(event.learning_event_id);
});

test("learning: a user correction is recorded as a candidate, not auto-promoted to persistent truth", () => {
  const event = recordCorrection({ previousClaim: "X is Y", correction: "X is Z", source: "user" });
  assert.equal(event.trigger, "user_correction");
  assert.equal(event.applies_to, "conversation");
  assert.equal(event.promoted_to_persistent, false);
});
