"use strict";

/**
 * Trinity NLP — Knowledge Representation Realm v0.1
 *
 * Sits directly above the Semantic Representation Realm in the realm
 * chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ENTITY
 *   -> RELATIONSHIP -> SEMANTIC REPRESENTATION -> KNOWLEDGE REPRESENTATION
 *   -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: take Proposition objects the Semantic Realm
 * already produced and give each one a first-class, individually
 * addressable Knowledge Record — nothing more. It does not reason,
 * deduce, induce, resolve context, resolve coreference, look anything
 * up, or estimate a probability. That begins at a later boundary
 * (Context / Reasoning), not here.
 *
 * === KNOWLEDGE != TRUTH (read this before touching this file) ===
 * Entering the Knowledge Realm is not an epistemic promotion. A
 * Proposition's truth_state (UNKNOWN, from this milestone's upstream
 * work), confidence (the existing nullable-number architecture),
 * probability (ProbabilityStatus.NOT_DEFINED unless already justified),
 * and uncertainty (UncertaintyStatus) all pass through UNCHANGED. This
 * realm never sets truth_state to KNOWN or VERIFIED merely because a
 * proposition was accepted into the knowledge store, and never
 * recalculates confidence/probability/uncertainty from one another.
 *
 * === Not the same "knowledge" as learning-core/knowledge/graph.js ===
 * That module is a pre-existing, unrelated subsystem: plain
 * (string, string, string) triples with a single confidence field,
 * asserted directly by core/privateAgent.js from conversational
 * extraction (including an already-invented confidence value — that is
 * existing, out-of-scope behavior, not something this realm follows or
 * touches). It has no truth_state, no probability, no uncertainty, no
 * evidence linkage, and no entity/proposition object references, so it
 * cannot hold what this milestone is required to preserve. Rather than
 * bending that shape or duplicating its name's meaning, this realm
 * defines its own explicit KnowledgeRecord contract and does not import
 * from, write to, or modify knowledge/graph.js in any way.
 *
 * === One proposition -> one knowledge record, always ===
 * No merging, no deduplication, no contradiction resolution. Two
 * propositions with identical subject/predicate/object still produce
 * two separate KnowledgeRecords (test 10) — this realm defines no
 * identity/equivalence rule under which they would ever collapse.
 * Likewise, two propositions that contradict each other (e.g. asserted
 * from different sentences) both become their own KnowledgeRecord;
 * deciding which one is true is explicitly a later reasoning/
 * verification layer's job, never this one's (test 11).
 *
 * === Provenance vs. evidence ===
 * `evidence` is copied forward unchanged from the Proposition (the
 * relationship id, character span, and source text slice it came
 * from) — the same object, not a summary of it. `provenance` is new at
 * this layer: which realm produced this record, the proposition's own
 * `source` label (e.g. "SYNTAX_SVO"), and when the record was built.
 * Neither ever substitutes for the other.
 */

const { extractPropositions } = require("./semanticRealm");
const { newKnowledgeId } = require("../../shared/ids");

function buildKnowledgeRecord(proposition) {
  if (!proposition || !proposition.id) {
    throw new TypeError("buildKnowledgeRecord requires a Proposition object (see semanticRealm.js).");
  }
  return {
    id: newKnowledgeId(),
    proposition_id: proposition.id,
    subject: proposition.subject,
    predicate: proposition.predicate,
    object: proposition.object,
    // Structural polarity, carried forward unchanged — see
    // semanticRealm.js and relationshipRealm.js. This is the exact
    // field reasoningRealm.js's checkConsistency reads for
    // POLARITY_CONTRADICTION detection.
    polarity: proposition.polarity,
    // Epistemic fields carried forward verbatim — never recalculated,
    // never collapsed into one another. See module doc above.
    truth_state: proposition.truth_state,
    confidence: proposition.confidence,
    probability: proposition.probability,
    uncertainty: proposition.uncertainty,
    evidence: proposition.evidence,
    provenance: {
      realm: "SEMANTIC_REPRESENTATION",
      proposition_source: proposition.source,
      created_at: new Date().toISOString(),
    },
    attributes: proposition.attributes,
  };
}

// Pure transform: given Proposition objects already produced elsewhere
// (e.g. by semanticRealm.extractPropositions), return one KnowledgeRecord
// per proposition, in order, with no merging or reordering.
function buildKnowledgeRecords(propositions) {
  if (!Array.isArray(propositions)) {
    throw new TypeError("buildKnowledgeRecords requires an array of Proposition objects.");
  }
  return propositions.map(buildKnowledgeRecord);
}

// Convenience wrapper mirroring every other realm's text-in interface:
// runs the full chain down to Semantic Representation, then converts.
function extractKnowledge(text, tokens, options = {}) {
  const semanticResult = extractPropositions(text, tokens, options);
  const records = buildKnowledgeRecords(semanticResult.propositions);

  return {
    state: semanticResult.state,
    records,
    ambiguous: semanticResult.ambiguous,
    unresolved: semanticResult.unresolved,
    reason: records.length ? null : semanticResult.reason,
  };
}

module.exports = { buildKnowledgeRecords, extractKnowledge };
