"use strict";

/**
 * Trinity — Reasoning Realm v0.1
 *
 * Sits above Knowledge Representation / Context Representation:
 *
 *   ... -> KNOWLEDGE REPRESENTATION -> CONTEXT REPRESENTATION
 *   -> REASONING -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: given KnowledgeRecord-shaped objects and
 * EXPLICIT, caller-supplied rules/constraints, (a) derive new records
 * by rule application, and (b) detect structural contradictions. It
 * never invents a rule, never hardcodes world knowledge ("birds fly"
 * is not built into this file anywhere), and never picks a winner
 * between contradicting records.
 *
 * === Derived != Observed (read this before touching this file) ===
 * A record produced by applyRule() always carries truth_state
 * TruthState.DERIVED and a `derived_from` provenance list naming the
 * premise record id(s) and the rule id that produced it. It is never
 * silently written back into the Knowledge Realm's own store or
 * relabeled KNOWN/VERIFIED — promoting a derived record to verified
 * fact is explicitly the Verification Realm's job, working from
 * independent evidence, not this realm's.
 *
 * === Rules are data, not code ===
 * A Rule is a plain object the CALLER constructs and passes in:
 *
 *   { id, if: { predicate, objectSurface }, then: { predicate, objectSurface } }
 *
 * applyRule() never consults any built-in table of "facts about the
 * world" — e.g. reproducing the classic "All birds fly. Penguins are
 * birds. Therefore penguins fly." example requires the CALLER to
 * supply the "birds fly" rule explicitly (from wherever they obtained
 * it — Knowledge Realm, direct assertion, etc.); this realm only ever
 * applies rules it is handed.
 *
 * === Contradiction detection, not resolution ===
 * checkConsistency() finds two kinds of structural conflict, both
 * driven by data the caller supplies, never invented here:
 *   1. POLARITY_CONTRADICTION — two records share subject identity,
 *      predicate, and object identity/surface, but one carries an
 *      explicit `polarity: Polarity.NEGATIVE` field the other lacks
 *      (default polarity is POSITIVE when the field is absent). This is
 *      how "John is in Toronto." / "John is not in Toronto." is
 *      represented here — as two explicit KnowledgeRecord-shaped
 *      objects with opposite polarity. As of Phase 5, `polarity` is
 *      genuinely populated by the real chain (relationshipRealm.js
 *      structurally detects "not"; see its module doc) as well as by
 *      hand-built records — this realm still never parses text itself
 *      or infers polarity on its own; it only ever compares whatever
 *      `polarity` field the records it is given already carry.
 *   2. CONSTRAINT_CONTRADICTION — for a predicate the caller has
 *      explicitly declared SINGLE_VALUE (e.g. "a person has exactly
 *      one home city"), two-or-more records sharing a subject identity
 *      but disagreeing on the object surface for that predicate.
 * Neither path deletes, merges, or ranks a record. Both produce a
 * structured ContradictionRecord with status CONTRADICTION_PRESENT
 * and the full list of conflicting record ids; resolving it is a later
 * realm's job (Verification, working from independent evidence).
 */

const { TruthState, Polarity } = require("../../shared/constants");
const { newReasoningId, newContradictionId, newEntityId } = require("../../shared/ids");

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }
  return value;
}

// Non-throwing predicate version of the same shape check, exported for
// callers (e.g. the Learning Engine's candidate validation) that need
// to ask "is this well-formed?" without a try/catch.
function isValidRuleShape(rule) {
  return !!(
    rule &&
    typeof rule === "object" &&
    rule.id &&
    rule.if &&
    typeof rule.if.predicate === "string" &&
    typeof rule.if.objectSurface === "string" &&
    rule.then &&
    typeof rule.then.predicate === "string" &&
    typeof rule.then.objectSurface === "string"
  );
}

function requireRuleShape(rule) {
  if (!isValidRuleShape(rule)) {
    throw new TypeError(
      'A rule must have shape { id, if: { predicate, objectSurface }, then: { predicate, objectSurface } }.'
    );
  }
}

// Deduction / rule-based reasoning: given ONE explicit rule and the
// records to test it against, return one DERIVED record per matching
// premise record. Never mutates `records`; matching is exact
// (predicate equality, case-insensitive object surface equality) —
// never fuzzy, never a guess.
function applyRule(rule, records) {
  requireRuleShape(rule);
  requireArray(records, "records");

  const derived = [];
  for (const record of records) {
    if (!record || record.predicate !== rule.if.predicate) continue;
    if (!record.object || typeof record.object.surface !== "string") continue;
    if (record.object.surface.toLowerCase() !== rule.if.objectSurface.toLowerCase()) continue;

    derived.push({
      id: newReasoningId(),
      subject: record.subject,
      predicate: rule.then.predicate,
      object: {
        id: newEntityId(),
        surface: rule.then.objectSurface,
        normalized: rule.then.objectSurface.toLowerCase(),
        type: "RULE_SUPPLIED",
        source: "REASONING_RULE",
      },
      truth_state: TruthState.DERIVED,
      confidence: null,
      probability: "NOT_DEFINED",
      uncertainty: "PRESENT",
      derived_from: [record.id, rule.id],
      evidence: { rule_id: rule.id, premise_record_id: record.id },
      provenance: {
        realm: "REASONING",
        mode: "RULE_APPLICATION",
        created_at: new Date().toISOString(),
      },
    });
  }
  return derived;
}

// Apply several rules against the same record set. Rules are applied
// independently (no rule sees another rule's derived output within
// this call) — chaining derivations across generations is a distinct,
// explicitly-invoked operation (see applyRulesUntilFixedPoint), not an
// implicit default, so a single derivation step stays easy to audit.
function applyRules(rules, records) {
  requireArray(rules, "rules");
  requireArray(records, "records");
  const derived = [];
  for (const rule of rules) {
    derived.push(...applyRule(rule, records));
  }
  return derived;
}

// Explicit multi-step closure: repeatedly applies every rule, feeding
// each step's derived records back in as premises for the next step,
// until no new record is produced or `maxSteps` is reached (default 5,
// a small explicit bound — never unbounded recursion). Every derived
// record still carries its own direct derived_from provenance, so a
// multi-hop chain remains traceable hop by hop.
function applyRulesUntilFixedPoint(rules, records, { maxSteps = 5 } = {}) {
  requireArray(rules, "rules");
  requireArray(records, "records");
  let frontier = records;
  const allDerived = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const newlyDerived = applyRules(rules, frontier);
    if (newlyDerived.length === 0) break;
    allDerived.push(...newlyDerived);
    frontier = newlyDerived;
  }
  return allDerived;
}

function surfaceKey(entityRef) {
  return entityRef && typeof entityRef.surface === "string" ? entityRef.surface.toLowerCase() : null;
}

// Consistency reasoning: detects (never resolves) structural
// contradictions. See module doc for the two detection modes. Returns
// [] when nothing conflicts — absence of a contradiction record is not
// itself evidence of truth, just of "no conflict was found among the
// records/constraints given."
function checkConsistency(records, { constraints = [] } = {}) {
  requireArray(records, "records");
  requireArray(constraints, "constraints");

  const contradictions = [];

  // 1. Polarity contradictions.
  const byPolarityKey = new Map();
  for (const record of records) {
    if (!record || !record.subject || !record.subject.id) continue;
    const key = [record.subject.id, record.predicate, surfaceKey(record.object)].join("::");
    if (!byPolarityKey.has(key)) byPolarityKey.set(key, []);
    byPolarityKey.get(key).push(record);
  }
  for (const [, group] of byPolarityKey) {
    const polarities = new Set(group.map((r) => r.polarity || Polarity.POSITIVE));
    if (polarities.size > 1) {
      contradictions.push({
        id: newContradictionId(),
        type: "POLARITY_CONTRADICTION",
        subject: group[0].subject,
        predicate: group[0].predicate,
        conflicting_records: group.map((r) => r.id),
        status: "CONTRADICTION_PRESENT",
        provenance: { realm: "REASONING", mode: "CONSISTENCY_CHECK", created_at: new Date().toISOString() },
      });
    }
  }

  // 2. Constraint (single-value) contradictions.
  for (const constraint of constraints) {
    if (!constraint || constraint.exclusivity !== "SINGLE_VALUE" || typeof constraint.predicate !== "string") {
      continue;
    }
    const bySubject = new Map();
    for (const record of records) {
      if (!record || record.predicate !== constraint.predicate || !record.subject || !record.subject.id) continue;
      if (!bySubject.has(record.subject.id)) bySubject.set(record.subject.id, []);
      bySubject.get(record.subject.id).push(record);
    }
    for (const [, group] of bySubject) {
      const distinctSurfaces = new Set(group.map((r) => surfaceKey(r.object)));
      if (distinctSurfaces.size > 1) {
        contradictions.push({
          id: newContradictionId(),
          type: "CONSTRAINT_CONTRADICTION",
          subject: group[0].subject,
          predicate: constraint.predicate,
          conflicting_records: group.map((r) => r.id),
          status: "CONTRADICTION_PRESENT",
          provenance: { realm: "REASONING", mode: "CONSISTENCY_CHECK", created_at: new Date().toISOString() },
        });
      }
    }
  }

  return contradictions;
}

module.exports = { applyRule, applyRules, applyRulesUntilFixedPoint, checkConsistency, isValidRuleShape };
