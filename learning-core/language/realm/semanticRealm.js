"use strict";

/**
 * Trinity NLP — Semantic Representation Realm v0.1
 *
 * Sits directly above the Relationship Realm in the realm chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ENTITY
 *   -> RELATIONSHIP -> SEMANTIC REPRESENTATION -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: turn each structurally-extracted Relationship
 * triple into an explicit Proposition object with its epistemic status
 * made honest and explicit. It does NOT interpret what a relationship
 * means (no "BITES" == "attacks", no "WORKS_AT" == "employed_by"), does
 * NOT verify anything, does NOT estimate a probability, and does NOT
 * reason about the world. That begins at the next boundary (Knowledge /
 * Context / Reasoning), not here.
 *
 * === Why a Proposition is not just a renamed Relationship ===
 * A Relationship is structural evidence: "the input's clause structure,
 * once parsed, yields this subject/predicate/object triple." A
 * Proposition adds the epistemic scaffolding a downstream reasoning
 * layer will eventually need to ask "is this actually true?" without
 * this layer ever answering that question itself:
 *
 *   truth_state  — existing shared/constants TruthState. Always UNKNOWN
 *                   here. Extracting "John works at Google." from text
 *                   means the INPUT STATES the relationship, not that
 *                   the engine has verified John actually works there.
 *                   Only the existing verification/verify.js contract
 *                   (an independent check) can ever move a proposition
 *                   toward VERIFIED — this realm never does that itself.
 *   confidence   — the EXISTING architectural field (memory/types.js,
 *                   knowledge/graph.js): a nullable number, never
 *                   invented. A proposition derived deterministically
 *                   from a relationship has no scoring mechanism behind
 *                   it, so confidence stays null — exactly the same
 *                   "not provided" convention already used elsewhere in
 *                   this codebase, not a new one.
 *   probability  — a distinct MATHEMATICAL concept from confidence.
 *                   ProbabilityStatus.NOT_DEFINED unless a real,
 *                   justified probability value exists (none does at
 *                   this phase). Never derived from confidence or
 *                   uncertainty.
 *   uncertainty  — represented structurally as UncertaintyStatus, never
 *                   computed as 1-confidence or 1-probability. PRESENT
 *                   by default: nothing this realm produces has been
 *                   independently verified, no matter how deterministic
 *                   its extraction was.
 *
 * These four fields are independent on purpose (see shared/constants.js
 * comments) — do not let a future change collapse them into each other.
 *
 * === Evidence ===
 * Every proposition keeps a reference back to the exact Relationship it
 * came from (id + span), plus the source text slice that span covers
 * when the original text is available. The semantic layer sits ABOVE
 * the evidence layer; it never discards it.
 *
 * === Entity/Relationship references, not strings ===
 * subject/object are the SAME entity-mention-shaped objects the
 * Relationship Realm already resolved (with their own ids) — never
 * re-stringified. Entity -> Relationship -> Proposition stays one chain
 * of linked objects.
 *
 * === Semantic normalization ===
 * The only "normalization" this realm performs is making subject/
 * predicate/object explicit fields on a first-class Proposition object.
 * It does not normalize BITES/WORKS_AT/etc. into any canonical meaning,
 * and it does not classify Google as a "company" or John as a "person"
 * beyond whatever EntityType the Entity Realm already assigned.
 *
 * === Negation / polarity (Phase 5) ===
 * A Proposition's `polarity` field (POSITIVE/NEGATIVE, shared/
 * constants.js) is copied forward verbatim from the Relationship Realm,
 * which is where "not" is actually detected structurally (do-support
 * negation at the Syntax layer, or a leading "not" inside an object
 * chunk — see relationshipRealm.js). This realm never inspects the
 * source text for "not" itself and never lets polarity influence
 * truth_state/confidence/probability/uncertainty — a negative polarity
 * is not evidence of falsehood, only of how the clause was stated.
 *
 * === Temporal information ===
 * Carried forward, never invented: when the Entity Realm already
 * resolved a DATE/TIME entity (e.g. "today", "3 PM") as a relationship
 * argument, that entity (with its existing `resolved`/`resolved_date`/
 * `time_24h` attributes) simply flows through as the proposition's
 * subject or object, unchanged. This realm never infers durations,
 * start dates, or any other temporal semantics beyond what was already
 * structurally resolved below it.
 *
 * === Multiple propositions ===
 * One relationship -> one proposition. A clause that already yielded
 * multiple relationships (e.g. "works at Google in Toronto" -> WORKS_AT
 * + WORKS_IN) yields multiple propositions, never collapsed into one.
 */

const { extractRelationships } = require("./relationshipRealm");
const { newPropositionId } = require("../../shared/ids");
const { TruthState, ProbabilityStatus, UncertaintyStatus } = require("../../shared/constants");

function buildProposition(relationship, text) {
  return {
    id: newPropositionId(),
    subject: relationship.subject,
    predicate: relationship.predicate,
    object: relationship.object,
    // Structural polarity, carried forward unchanged from the
    // Relationship Realm — never recalculated, never used to move
    // truth_state/confidence/probability/uncertainty below. See
    // relationshipRealm.js's own module doc for how it is detected.
    polarity: relationship.polarity,
    source: relationship.source,
    evidence: {
      relationship_id: relationship.id,
      span: relationship.span,
      text: typeof text === "string" ? text.slice(relationship.span.start, relationship.span.end) : null,
    },
    // Epistemic fields — deliberately independent. See module doc above.
    truth_state: TruthState.UNKNOWN,
    confidence: null,
    probability: ProbabilityStatus.NOT_DEFINED,
    uncertainty: UncertaintyStatus.PRESENT,
    attributes: relationship.attributes,
  };
}

function extractPropositions(text, tokens, options = {}) {
  const relResult = extractRelationships(text, tokens, options);
  const propositions = relResult.relationships.map((relationship) => buildProposition(relationship, text));

  return {
    state: relResult.state,
    propositions,
    ambiguous: relResult.ambiguous,
    unresolved: relResult.unresolved,
    reason: propositions.length ? null : relResult.reason,
  };
}

module.exports = { extractPropositions };
