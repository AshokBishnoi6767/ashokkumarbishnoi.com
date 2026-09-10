"use strict";

/**
 * Trinity — Policy / Business Rule Engine v0.1 (Customer Intelligence)
 *
 * Sits alongside the language/knowledge chain, the same way math/engine.js
 * and reasoningRealm.js do — this module has no dependency on Customer
 * Intent, Customer State, Tools, or any other not-yet-built Customer
 * Intelligence subsystem. It is a freestanding, first-class deterministic
 * evaluator: given an explicit policy/rule definition (data the CALLER
 * supplies, never hardcoded here) and an explicit set of facts (also
 * caller-supplied — this module never looks anything up, calls a tool, or
 * invents a business fact), it produces an eligibility/decision result.
 *
 * === Rules and policies are data, not code (same discipline as reasoningRealm.js) ===
 * This file contains NO knowledge of what a "30-day return window" or a
 * "final sale" item actually is for any real business. Every example
 * elsewhere in this codebase (tests, demo) is clearly synthetic —
 * illustrating the mechanism, never asserted as a real policy.
 *
 * === POLICY vs. RULE (Phase 8's "do not collapse them") ===
 * A BusinessRule is the generic primitive: an id and a list of
 * conditions, producing a three-valued DECISION (true / false / UNKNOWN
 * — see evaluateRule). A Policy is a specialized rule with the
 * additional structure real business policies need: version, exceptions
 * (conditions that override eligibility even when the main conditions
 * hold), an effective period, and priority for precedence among several
 * applicable policies. Both share the same condition-evaluation
 * primitive (evaluateConditionSet/evaluateCondition) rather than
 * duplicating comparison logic — sharing a primitive is not the same as
 * collapsing the two *types*, which remain distinct named shapes with
 * distinct result vocabularies (EligibilityStatus for Policy, a plain
 * boolean-or-null `decision` for BusinessRule).
 *
 * === Never fabricate policy, never guess a fact ===
 * A condition whose `field` is absent from the supplied `facts` object
 * evaluates to UNKNOWN (null), never defaulted to true or false. Three-
 * valued (Kleene) logic combines conditions/exceptions so a conclusively
 * reachable answer is still reported even when SOME unrelated fact is
 * missing (e.g. one failed condition already makes an AND-set false
 * regardless of what else is unknown) — this is deliberate precision,
 * not guessing: every UNKNOWN reported here corresponds to a fact that
 * would have to be known to change the answer.
 *
 * === Effective period and "now" ===
 * Evaluation never calls Date.now() internally — the caller supplies
 * `now` (or omits it, in which case the effective-period check is
 * skipped entirely rather than silently assuming "always effective").
 * This keeps evaluatePolicy a pure function: identical inputs always
 * produce an identical result, exactly like every deterministic realm
 * below it.
 *
 * === Multiple policies: conflicts are reported, never silently resolved ===
 * evaluatePolicies() never discards a policy that came out ELIGIBLE
 * merely because another one also did. When more than one is eligible,
 * `precedence` names the single highest-priority one only if there is a
 * unique highest priority; a genuine priority tie is reported as
 * `conflict: true` with `precedence: null` — resolving a real tie is
 * explicitly a later Resolution/Decision layer's job, not this one's.
 */

const { EligibilityStatus, ConditionOperator } = require("../shared/constants");
const { newPolicyEvaluationId } = require("../shared/ids");

function provenance(realm, extra = {}) {
  return { realm, created_at: new Date().toISOString(), ...extra };
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function isConditionShape(condition) {
  return (
    !!condition &&
    typeof condition === "object" &&
    typeof condition.field === "string" &&
    typeof condition.operator === "string" &&
    Object.prototype.hasOwnProperty.call(condition, "value")
  );
}

function evaluateOperator(operator, factValue, expected) {
  switch (operator) {
    case ConditionOperator.EQ:
      return factValue === expected;
    case ConditionOperator.NEQ:
      return factValue !== expected;
    case ConditionOperator.LT:
      return typeof factValue === "number" && typeof expected === "number" && factValue < expected;
    case ConditionOperator.LTE:
      return typeof factValue === "number" && typeof expected === "number" && factValue <= expected;
    case ConditionOperator.GT:
      return typeof factValue === "number" && typeof expected === "number" && factValue > expected;
    case ConditionOperator.GTE:
      return typeof factValue === "number" && typeof expected === "number" && factValue >= expected;
    case ConditionOperator.IN:
      return Array.isArray(expected) && expected.includes(factValue);
    case ConditionOperator.NOT_IN:
      return Array.isArray(expected) && !expected.includes(factValue);
    default:
      throw new TypeError(`Unsupported condition operator: ${operator}`);
  }
}

// One condition against one fact set -> true | false | null(UNKNOWN).
// null means the fact this condition needs was never supplied — this is
// the ONLY source of an UNKNOWN result anywhere in this module.
function evaluateCondition(condition, facts) {
  if (!isConditionShape(condition)) {
    throw new TypeError("A condition must have shape { field, operator, value }.");
  }
  if (!Object.prototype.hasOwnProperty.call(facts, condition.field)) {
    return { condition, result: null, factValue: undefined, reason: `fact '${condition.field}' was not supplied` };
  }
  const factValue = facts[condition.field];
  const result = evaluateOperator(condition.operator, factValue, condition.value);
  return { condition, result, factValue, reason: null };
}

// AND-semantics with Kleene logic: any FALSE short-circuits the whole
// set to false regardless of other unknowns (a conclusive "no" doesn't
// need every fact); otherwise any UNKNOWN makes the set UNKNOWN; only
// when every condition is true does the set evaluate to true.
function evaluateConditionSet(conditions, facts) {
  const evaluated = conditions.map((c) => evaluateCondition(c, facts));
  const hasFalse = evaluated.some((e) => e.result === false);
  const hasUnknown = evaluated.some((e) => e.result === null);
  const combined = hasFalse ? false : hasUnknown ? null : true;
  return { combined, evaluated };
}

// OR-semantics with Kleene logic, for exceptions: any TRUE short-
// circuits to triggered=true regardless of other unknowns (one
// conclusive exception is enough to disqualify); otherwise any UNKNOWN
// makes it UNKNOWN whether an exception applies; only when every
// exception is false is it conclusively NOT triggered.
function evaluateExceptionSet(exceptions, facts) {
  const evaluated = exceptions.map((c) => evaluateCondition(c, facts));
  const hasTrue = evaluated.some((e) => e.result === true);
  const hasUnknown = evaluated.some((e) => e.result === null);
  const triggered = hasTrue ? true : hasUnknown ? null : false;
  return { triggered, evaluated };
}

function isPolicyShape(policy) {
  return !!policy && typeof policy === "object" && typeof policy.id === "string" && Array.isArray(policy.conditions);
}

function requirePolicyShape(policy) {
  if (!isPolicyShape(policy)) {
    throw new TypeError("A policy must have shape { id, conditions: [...], ... } (see module doc).");
  }
}

function effectivePeriodStatus(policy, now) {
  if (!policy.effective_period || now === null || now === undefined) return null;
  const { from, to } = policy.effective_period;
  if (from && now < from) return { effective: false, reason: `now (${now}) is before effective_period.from (${from})` };
  if (to && now > to) return { effective: false, reason: `now (${now}) is after effective_period.to (${to})` };
  return { effective: true, reason: null };
}

// Evaluate ONE policy against ONE fact set. Pure function: no I/O, no
// lookups, no clock reads (see module doc on `now`).
function evaluatePolicy(policy, facts, { now = null } = {}) {
  requirePolicyShape(policy);
  if (typeof facts !== "object" || facts === null) {
    throw new TypeError("evaluatePolicy requires a facts object (pass {} if there are none).");
  }

  const base = {
    id: newPolicyEvaluationId(),
    policy_id: policy.id,
    version: policy.version ?? null,
    priority: policy.priority ?? null,
    provenance: provenance("POLICY_ENGINE", { policy_version: policy.version ?? null }),
  };

  const periodStatus = effectivePeriodStatus(policy, now);
  if (periodStatus && periodStatus.effective === false) {
    return {
      ...base,
      status: EligibilityStatus.NOT_EFFECTIVE,
      eligible: null,
      matched_conditions: [],
      failed_conditions: [],
      unknown_conditions: [],
      exception_triggered: null,
      reason: periodStatus.reason,
    };
  }

  const exceptions = requireArray(policy.exceptions || [], "policy.exceptions");
  const exceptionResult = evaluateExceptionSet(exceptions, facts);

  // A conclusively-triggered exception overrides eligibility regardless
  // of what the main conditions say — checked first so a definite
  // disqualification is never masked by an unrelated unknown condition.
  if (exceptionResult.triggered === true) {
    return {
      ...base,
      status: EligibilityStatus.NOT_ELIGIBLE,
      eligible: false,
      matched_conditions: [],
      failed_conditions: [],
      unknown_conditions: [],
      exception_triggered: exceptionResult.evaluated.find((e) => e.result === true).condition,
      reason: "an exception condition was met",
    };
  }

  const conditions = requireArray(policy.conditions, "policy.conditions");
  const condResult = evaluateConditionSet(conditions, facts);
  const matched = condResult.evaluated.filter((e) => e.result === true).map((e) => e.condition);
  const failed = condResult.evaluated.filter((e) => e.result === false).map((e) => e.condition);
  const unknownFromConditions = condResult.evaluated.filter((e) => e.result === null).map((e) => e.condition);
  const unknownFromExceptions = exceptionResult.evaluated.filter((e) => e.result === null).map((e) => e.condition);

  if (condResult.combined === false) {
    return {
      ...base,
      status: EligibilityStatus.NOT_ELIGIBLE,
      eligible: false,
      matched_conditions: matched,
      failed_conditions: failed,
      unknown_conditions: [],
      exception_triggered: null,
      reason: "one or more conditions were not met",
    };
  }

  if (condResult.combined === null || exceptionResult.triggered === null) {
    return {
      ...base,
      status: EligibilityStatus.UNKNOWN,
      eligible: null,
      matched_conditions: matched,
      failed_conditions: failed,
      unknown_conditions: [...unknownFromConditions, ...unknownFromExceptions],
      exception_triggered: null,
      reason: "a required fact was not supplied; eligibility cannot be determined without it",
    };
  }

  return {
    ...base,
    status: EligibilityStatus.ELIGIBLE,
    eligible: true,
    matched_conditions: matched,
    failed_conditions: [],
    unknown_conditions: [],
    exception_triggered: null,
    reason: null,
  };
}

// Evaluate several policies against the same fact set. Never discards
// an eligible policy to make room for another — see module doc.
function evaluatePolicies(policies, facts, opts = {}) {
  requireArray(policies, "policies");
  const results = policies.map((p) => evaluatePolicy(p, facts, opts));
  const eligible = results.filter((r) => r.status === EligibilityStatus.ELIGIBLE);

  let precedence = null;
  let conflict = false;
  if (eligible.length === 1) {
    precedence = eligible[0].policy_id;
  } else if (eligible.length > 1) {
    const priorities = eligible.map((r) => r.priority ?? 0);
    const maxPriority = Math.max(...priorities);
    const top = eligible.filter((r) => (r.priority ?? 0) === maxPriority);
    if (top.length === 1) {
      precedence = top[0].policy_id;
    } else {
      conflict = true;
    }
  }

  return { results, eligible_policy_ids: eligible.map((r) => r.policy_id), precedence, conflict };
}

function isRuleShape(rule) {
  return !!rule && typeof rule === "object" && typeof rule.id === "string" && Array.isArray(rule.conditions);
}

// The generic Business Rule primitive (Phase 8): conditions -> a plain
// three-valued decision, with none of Policy's version/exception/
// effective-period/priority structure. `then` is caller-supplied
// metadata describing what the decision means (e.g. { action:
// "APPROVE_CREDIT" }) — this module never interprets it or executes
// anything from it.
function evaluateRule(rule, facts) {
  if (!isRuleShape(rule)) {
    throw new TypeError("A rule must have shape { id, conditions: [...], then }.");
  }
  if (typeof facts !== "object" || facts === null) {
    throw new TypeError("evaluateRule requires a facts object (pass {} if there are none).");
  }

  const condResult = evaluateConditionSet(rule.conditions, facts);
  const matched = condResult.evaluated.filter((e) => e.result === true).map((e) => e.condition);
  const failed = condResult.evaluated.filter((e) => e.result === false).map((e) => e.condition);
  const unknown = condResult.evaluated.filter((e) => e.result === null).map((e) => e.condition);

  return {
    id: newPolicyEvaluationId(),
    rule_id: rule.id,
    decision: condResult.combined,
    then: condResult.combined === true ? rule.then ?? null : null,
    matched_conditions: matched,
    failed_conditions: failed,
    unknown_conditions: condResult.combined === null ? unknown : [],
    reason: condResult.combined === null ? "a required fact was not supplied; decision cannot be determined without it" : null,
    provenance: provenance("BUSINESS_RULE_ENGINE"),
  };
}

module.exports = {
  evaluateCondition,
  evaluateConditionSet,
  evaluateExceptionSet,
  evaluatePolicy,
  evaluatePolicies,
  evaluateRule,
};
