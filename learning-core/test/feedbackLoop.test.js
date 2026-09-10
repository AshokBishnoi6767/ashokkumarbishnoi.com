"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { initialState, recordFeedback, feedbackToLearningCandidate } = require("../learning/feedbackLoop");

test("Feedback loop: a CONFIRMED cycle updates confirmed_count, not mismatch_count", () => {
  const cycle = recordFeedback({ input: "2+2", estimate: 4, output: 4, matched: true });
  assert.equal(cycle.feedback, "CONFIRMED");
  assert.equal(cycle.updated_state.confirmed_count, 1);
  assert.equal(cycle.updated_state.mismatch_count, 0);
});

test("Feedback loop: a MISMATCH cycle updates mismatch_count, not confirmed_count", () => {
  const cycle = recordFeedback({ input: "2+2", estimate: 5, output: 4, matched: false });
  assert.equal(cycle.feedback, "MISMATCH");
  assert.equal(cycle.updated_state.mismatch_count, 1);
  assert.equal(cycle.updated_state.confirmed_count, 0);
});

test("Feedback loop: requires an explicit boolean `matched`, never infers it", () => {
  assert.throws(() => recordFeedback({ input: "x", estimate: 1, output: 1 }), TypeError);
  assert.throws(() => recordFeedback({ input: "x", estimate: 1, output: 1, matched: "yes" }), TypeError);
});

test("Feedback loop: state accumulates across cycles — INPUT -> ESTIMATE -> OUTPUT -> FEEDBACK -> UPDATED STATE -> NEXT INPUT", () => {
  let state = initialState();
  const cycle1 = recordFeedback({ input: "a", estimate: 1, output: 1, matched: true, currentState: state });
  state = cycle1.updated_state;
  const cycle2 = recordFeedback({ input: "b", estimate: 2, output: 3, matched: false, currentState: state });
  state = cycle2.updated_state;
  const cycle3 = recordFeedback({ input: "c", estimate: 5, output: 5, matched: true, currentState: state });

  assert.equal(cycle3.updated_state.confirmed_count, 2);
  assert.equal(cycle3.updated_state.mismatch_count, 1);
  assert.equal(cycle3.updated_state.cycles.length, 3);
  assert.deepEqual(cycle3.updated_state.cycles, [cycle1.id, cycle2.id, cycle3.id]);
});

test("Feedback loop: accepts a real integration/actions/lifecycle.js-shaped record as evidence", () => {
  // Matches the shape finish() in integration/actions/lifecycle.js returns.
  const lifecycleRecord = {
    action_id: "action-1",
    capability: "calendar.event.create",
    action_status: "COMPLETED",
    result: "SUCCESS",
    verified: true,
  };
  const cycle = recordFeedback({
    input: { capability: "calendar.event.create" },
    estimate: "SUCCESS",
    output: lifecycleRecord.result,
    matched: lifecycleRecord.verified,
    evidence: lifecycleRecord,
  });
  assert.equal(cycle.feedback, "CONFIRMED");
  assert.deepEqual(cycle.evidence, lifecycleRecord);
});

test("Feedback loop: feedbackToLearningCandidate produces a CANDIDATE learning event for a MISMATCH, never auto-promoted", () => {
  const cycle = recordFeedback({ input: "2+2", estimate: 5, output: 4, matched: false, evidence: { note: "arithmetic check failed" } });
  const event = feedbackToLearningCandidate(cycle);
  assert.equal(event.trigger, "verification_mismatch");
  assert.equal(event.applies_to, "conversation");
  assert.equal(event.promoted_to_persistent, false);
  assert.deepEqual(event.evidence.output, 4);
});

test("Feedback loop: feedbackToLearningCandidate returns null for a CONFIRMED cycle — nothing to correct", () => {
  const cycle = recordFeedback({ input: "2+2", estimate: 4, output: 4, matched: true });
  assert.equal(feedbackToLearningCandidate(cycle), null);
});

test("Feedback loop: feedbackToLearningCandidate rejects a non-cycle input", () => {
  assert.throws(() => feedbackToLearningCandidate({}), TypeError);
  assert.throws(() => feedbackToLearningCandidate(null), TypeError);
});

test("Feedback loop: every cycle carries provenance identifying this realm", () => {
  const cycle = recordFeedback({ input: "x", estimate: 1, output: 1, matched: true });
  assert.equal(cycle.provenance.realm, "FEEDBACK");
  assert.ok(!Number.isNaN(Date.parse(cycle.provenance.created_at)));
});
