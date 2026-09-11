"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { assessBehavioralRisk, isCleared, STATUS } = require("../integration/security/behavioralRisk");

test("assessBehavioralRisk: honestly reports NOT_AVAILABLE — never fabricates a risk score", () => {
  const result = assessBehavioralRisk({ uid: "real-owner-uid", requestText: "anything" });
  assert.equal(result.status, STATUS.NOT_AVAILABLE);
  assert.equal(result.risk, null);
  assert.match(result.reason, /not implemented/i);
});

test("assessBehavioralRisk: the result is frozen — nothing downstream can mutate it into a false clearance", () => {
  const result = assessBehavioralRisk({});
  assert.throws(() => {
    result.risk = "LOW";
  }, /Cannot assign to read only property|not extensible/);
});

test("isCleared: NOT_AVAILABLE is never treated as clearance, regardless of context", () => {
  assert.equal(isCleared(assessBehavioralRisk({})), false);
  assert.equal(isCleared(null), false);
  assert.equal(isCleared(undefined), false);
});

test("isCleared: fails closed on any malformed/forged assessment shape, not just NOT_AVAILABLE", () => {
  assert.equal(isCleared({ status: "CLEARED", risk: "LOW" }), false); // unrecognized status string is not trusted
  assert.equal(isCleared({ status: STATUS.NOT_AVAILABLE, risk: "LOW" }), false); // NOT_AVAILABLE always wins regardless of a forged risk field
  assert.equal(isCleared({ risk: "LOW" }), false); // no status at all
});
