"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateCondition,
  evaluateConditionSet,
  evaluateExceptionSet,
  evaluatePolicy,
  evaluatePolicies,
  evaluateRule,
} = require("../policy/engine");
const { EligibilityStatus, ConditionOperator } = require("../shared/constants");

// Synthetic, illustrative policy only — mirrors the exact example from
// the customer-intelligence spec. Not asserted as any real business's
// actual policy.
const refundPolicy = Object.freeze({
  id: "policy-refund-standard",
  version: 1,
  priority: 1,
  conditions: [
    { field: "purchase_age_days", operator: ConditionOperator.LTE, value: 30 },
    { field: "payment_status", operator: ConditionOperator.EQ, value: "completed" },
  ],
  exceptions: [{ field: "product_category", operator: ConditionOperator.EQ, value: "final_sale" }],
});

test("evaluateCondition: EQ/NEQ/LT/LTE/GT/GTE/IN/NOT_IN all compute the real comparison, never a guess", () => {
  const facts = { age: 25, category: "electronics" };
  assert.equal(evaluateCondition({ field: "age", operator: ConditionOperator.EQ, value: 25 }, facts).result, true);
  assert.equal(evaluateCondition({ field: "age", operator: ConditionOperator.NEQ, value: 25 }, facts).result, false);
  assert.equal(evaluateCondition({ field: "age", operator: ConditionOperator.LT, value: 30 }, facts).result, true);
  assert.equal(evaluateCondition({ field: "age", operator: ConditionOperator.LTE, value: 25 }, facts).result, true);
  assert.equal(evaluateCondition({ field: "age", operator: ConditionOperator.GT, value: 25 }, facts).result, false);
  assert.equal(evaluateCondition({ field: "age", operator: ConditionOperator.GTE, value: 25 }, facts).result, true);
  assert.equal(evaluateCondition({ field: "category", operator: ConditionOperator.IN, value: ["electronics", "books"] }, facts).result, true);
  assert.equal(evaluateCondition({ field: "category", operator: ConditionOperator.NOT_IN, value: ["electronics"] }, facts).result, false);
});

test("evaluateCondition: a fact that was never supplied is UNKNOWN (null), never defaulted to true or false", () => {
  const result = evaluateCondition({ field: "purchase_age_days", operator: ConditionOperator.LTE, value: 30 }, {});
  assert.equal(result.result, null);
  assert.ok(result.reason.includes("purchase_age_days"));
});

test("evaluateConditionSet: any FALSE short-circuits the AND-set even when another condition is UNKNOWN — a conclusive 'no' doesn't need every fact", () => {
  const conditions = [
    { field: "purchase_age_days", operator: ConditionOperator.LTE, value: 30 }, // will fail
    { field: "payment_status", operator: ConditionOperator.EQ, value: "completed" }, // will be unknown
  ];
  const { combined } = evaluateConditionSet(conditions, { purchase_age_days: 90 });
  assert.equal(combined, false);
});

test("evaluateConditionSet: no FALSE but one UNKNOWN makes the set UNKNOWN, not a guess", () => {
  const conditions = [
    { field: "purchase_age_days", operator: ConditionOperator.LTE, value: 30 },
    { field: "payment_status", operator: ConditionOperator.EQ, value: "completed" },
  ];
  const { combined } = evaluateConditionSet(conditions, { purchase_age_days: 10 });
  assert.equal(combined, null);
});

test("evaluateConditionSet: all true -> combined true", () => {
  const conditions = [{ field: "a", operator: ConditionOperator.EQ, value: 1 }];
  assert.equal(evaluateConditionSet(conditions, { a: 1 }).combined, true);
});

test("evaluateExceptionSet: any TRUE short-circuits to triggered=true even with another exception UNKNOWN", () => {
  const exceptions = [
    { field: "product_category", operator: ConditionOperator.EQ, value: "final_sale" },
    { field: "fraud_flag", operator: ConditionOperator.EQ, value: true },
  ];
  const { triggered } = evaluateExceptionSet(exceptions, { product_category: "final_sale" });
  assert.equal(triggered, true);
});

test("evaluatePolicy: refund policy — all facts known and satisfied -> ELIGIBLE", () => {
  const result = evaluatePolicy(refundPolicy, {
    purchase_age_days: 10,
    payment_status: "completed",
    product_category: "electronics",
  });
  assert.equal(result.status, EligibilityStatus.ELIGIBLE);
  assert.equal(result.eligible, true);
  assert.equal(result.matched_conditions.length, 2);
  assert.equal(result.policy_id, "policy-refund-standard");
  assert.equal(result.version, 1);
});

test("evaluatePolicy: refund policy — purchase too old -> NOT_ELIGIBLE, conclusively, even with unrelated missing facts", () => {
  const result = evaluatePolicy(refundPolicy, { purchase_age_days: 90 });
  assert.equal(result.status, EligibilityStatus.NOT_ELIGIBLE);
  assert.equal(result.eligible, false);
  assert.equal(result.failed_conditions.length, 1);
  assert.deepEqual(result.unknown_conditions, []);
});

test("evaluatePolicy: refund policy — required facts missing, nothing else disqualifies -> UNKNOWN, listing every missing fact (both a condition and the exception's field are unsupplied here)", () => {
  const result = evaluatePolicy(refundPolicy, { purchase_age_days: 10 });
  assert.equal(result.status, EligibilityStatus.UNKNOWN);
  assert.equal(result.eligible, null);
  const unknownFields = result.unknown_conditions.map((c) => c.field).sort();
  assert.deepEqual(unknownFields, ["payment_status", "product_category"]);
});

test("evaluatePolicy: refund policy — only the exception's fact is missing (conditions fully known and satisfied) -> UNKNOWN names just that one field", () => {
  const result = evaluatePolicy(refundPolicy, { purchase_age_days: 10, payment_status: "completed" });
  assert.equal(result.status, EligibilityStatus.UNKNOWN);
  assert.equal(result.unknown_conditions.length, 1);
  assert.equal(result.unknown_conditions[0].field, "product_category");
});

test("evaluatePolicy: refund policy — exception (final_sale) triggers -> NOT_ELIGIBLE even though the main conditions are satisfied", () => {
  const result = evaluatePolicy(refundPolicy, {
    purchase_age_days: 10,
    payment_status: "completed",
    product_category: "final_sale",
  });
  assert.equal(result.status, EligibilityStatus.NOT_ELIGIBLE);
  assert.equal(result.eligible, false);
  assert.ok(result.exception_triggered);
  assert.equal(result.exception_triggered.field, "product_category");
});

test("evaluatePolicy: a conclusively-triggered exception overrides eligibility even when the main conditions are UNKNOWN", () => {
  const result = evaluatePolicy(refundPolicy, { product_category: "final_sale" });
  assert.equal(result.status, EligibilityStatus.NOT_ELIGIBLE);
  assert.equal(result.eligible, false);
});

test("evaluatePolicy: an UNKNOWN exception (fact not supplied) makes the whole result UNKNOWN, not a silent pass-through", () => {
  const policyWithUnknownException = {
    ...refundPolicy,
    exceptions: [{ field: "fraud_flag", operator: ConditionOperator.EQ, value: true }],
  };
  const result = evaluatePolicy(policyWithUnknownException, {
    purchase_age_days: 10,
    payment_status: "completed",
  });
  assert.equal(result.status, EligibilityStatus.UNKNOWN);
});

test("evaluatePolicy: effective_period — 'now' before the window -> NOT_EFFECTIVE, not NOT_ELIGIBLE", () => {
  const timedPolicy = { ...refundPolicy, effective_period: { from: "2026-01-01", to: "2026-12-31" } };
  const result = evaluatePolicy(timedPolicy, { purchase_age_days: 10, payment_status: "completed" }, { now: "2025-06-01" });
  assert.equal(result.status, EligibilityStatus.NOT_EFFECTIVE);
  assert.equal(result.eligible, null);
});

test("evaluatePolicy: effective_period — 'now' within the window proceeds to normal evaluation", () => {
  const timedPolicy = { ...refundPolicy, effective_period: { from: "2026-01-01", to: "2026-12-31" } };
  const result = evaluatePolicy(
    timedPolicy,
    { purchase_age_days: 10, payment_status: "completed", product_category: "electronics" },
    { now: "2026-06-01" }
  );
  assert.equal(result.status, EligibilityStatus.ELIGIBLE);
});

test("evaluatePolicy: omitting 'now' entirely skips the effective_period check rather than assuming always-effective as a guess vs. always-ineffective", () => {
  const timedPolicy = { ...refundPolicy, effective_period: { from: "2026-01-01", to: "2026-12-31" } };
  const result = evaluatePolicy(timedPolicy, {
    purchase_age_days: 10,
    payment_status: "completed",
    product_category: "electronics",
  });
  assert.equal(result.status, EligibilityStatus.ELIGIBLE);
});

test("evaluatePolicy: rejects malformed policy/facts rather than silently proceeding", () => {
  assert.throws(() => evaluatePolicy({ id: "x" }, {}), TypeError);
  assert.throws(() => evaluatePolicy(refundPolicy, null), TypeError);
});

test("evaluatePolicy: determinism — same policy/facts yields structurally identical result except generated ids/timestamps", () => {
  const facts = { purchase_age_days: 10, payment_status: "completed", product_category: "electronics" };
  const a = evaluatePolicy(refundPolicy, facts);
  const b = evaluatePolicy(refundPolicy, facts);
  assert.equal(a.status, b.status);
  assert.equal(a.eligible, b.eligible);
  assert.deepEqual(a.matched_conditions, b.matched_conditions);
  assert.notEqual(a.id, b.id);
});

test("evaluatePolicies: a single eligible policy sets precedence to its own id", () => {
  const { results, eligible_policy_ids, precedence, conflict } = evaluatePolicies(
    [refundPolicy],
    { purchase_age_days: 10, payment_status: "completed", product_category: "electronics" }
  );
  assert.equal(results.length, 1);
  assert.deepEqual(eligible_policy_ids, ["policy-refund-standard"]);
  assert.equal(precedence, "policy-refund-standard");
  assert.equal(conflict, false);
});

test("evaluatePolicies: two eligible policies with distinct priority -> the higher-priority one takes precedence, neither is discarded", () => {
  const lowPriority = { ...refundPolicy, id: "policy-low", priority: 1 };
  const highPriority = { ...refundPolicy, id: "policy-high", priority: 5 };
  const facts = { purchase_age_days: 10, payment_status: "completed", product_category: "electronics" };
  const { results, eligible_policy_ids, precedence, conflict } = evaluatePolicies([lowPriority, highPriority], facts);
  assert.equal(results.length, 2);
  assert.deepEqual(eligible_policy_ids.sort(), ["policy-high", "policy-low"]);
  assert.equal(precedence, "policy-high");
  assert.equal(conflict, false);
});

test("evaluatePolicies: two eligible policies with a genuine priority TIE is reported as a conflict, never silently resolved", () => {
  const a = { ...refundPolicy, id: "policy-a", priority: 3 };
  const b = { ...refundPolicy, id: "policy-b", priority: 3 };
  const facts = { purchase_age_days: 10, payment_status: "completed", product_category: "electronics" };
  const { precedence, conflict } = evaluatePolicies([a, b], facts);
  assert.equal(precedence, null);
  assert.equal(conflict, true);
});

test("evaluatePolicies: zero eligible policies -> no precedence, no conflict", () => {
  const { eligible_policy_ids, precedence, conflict } = evaluatePolicies([refundPolicy], { purchase_age_days: 90 });
  assert.deepEqual(eligible_policy_ids, []);
  assert.equal(precedence, null);
  assert.equal(conflict, false);
});

test("evaluateRule (Phase 8, generic Business Rule — distinct from Policy): all conditions true -> decision true, 'then' populated", () => {
  const rule = {
    id: "rule-priority-support",
    conditions: [{ field: "tier", operator: ConditionOperator.EQ, value: "premium" }],
    then: { queue: "PRIORITY" },
  };
  const result = evaluateRule(rule, { tier: "premium" });
  assert.equal(result.decision, true);
  assert.deepEqual(result.then, { queue: "PRIORITY" });
});

test("evaluateRule: decision false -> 'then' is never populated (no fabricated action for an unmet rule)", () => {
  const rule = {
    id: "rule-priority-support",
    conditions: [{ field: "tier", operator: ConditionOperator.EQ, value: "premium" }],
    then: { queue: "PRIORITY" },
  };
  const result = evaluateRule(rule, { tier: "standard" });
  assert.equal(result.decision, false);
  assert.equal(result.then, null);
});

test("evaluateRule: a missing required fact yields decision null (UNKNOWN), 'then' withheld, never guessed", () => {
  const rule = {
    id: "rule-priority-support",
    conditions: [{ field: "tier", operator: ConditionOperator.EQ, value: "premium" }],
    then: { queue: "PRIORITY" },
  };
  const result = evaluateRule(rule, {});
  assert.equal(result.decision, null);
  assert.equal(result.then, null);
  assert.equal(result.unknown_conditions.length, 1);
});

test("evaluateRule: rejects malformed rule shape", () => {
  assert.throws(() => evaluateRule({ id: "x" }, {}), TypeError);
  assert.throws(() => evaluateRule({ id: "x", conditions: [] }, null), TypeError);
});

test("Provenance: every evaluatePolicy/evaluateRule result names its own realm, distinctly", () => {
  const policyResult = evaluatePolicy(refundPolicy, { purchase_age_days: 90 });
  const ruleResult = evaluateRule({ id: "r", conditions: [] }, {});
  assert.equal(policyResult.provenance.realm, "POLICY_ENGINE");
  assert.equal(ruleResult.provenance.realm, "BUSINESS_RULE_ENGINE");
});
