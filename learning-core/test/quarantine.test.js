"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { routeToQuarantine, isDecisionTrustworthy, STATUS } = require("../integration/security/quarantine");

test("routeToQuarantine: honestly reports NOT_AVAILABLE — never fabricates a quarantine decision", () => {
  const decision = routeToQuarantine({ principal: { kind: "public" }, note: "suspicious pattern" });
  assert.equal(decision.status, STATUS.NOT_AVAILABLE);
  assert.equal(decision.quarantined, false);
  assert.match(decision.reason, /No real risk engine/);
});

test("routeToQuarantine: the decision is frozen — nothing downstream can mutate it into a false clearance or false quarantine claim", () => {
  const decision = routeToQuarantine({});
  assert.throws(() => {
    decision.quarantined = true;
  }, /Cannot assign to read only property|not extensible/);
});

test("isDecisionTrustworthy: always false today, including against a forged decision shape designed to look legitimate", () => {
  assert.equal(isDecisionTrustworthy(routeToQuarantine({})), false);
  assert.equal(isDecisionTrustworthy({ status: "CLEARED", quarantined: false, reason: "looks fine" }), false);
  assert.equal(isDecisionTrustworthy({ status: STATUS.NOT_AVAILABLE, quarantined: true, evidence: "fabricated" }), false);
  assert.equal(isDecisionTrustworthy(null), false);
  assert.equal(isDecisionTrustworthy(undefined), false);
});
