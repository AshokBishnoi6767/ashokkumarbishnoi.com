"use strict";

/**
 * Trinity — Memory Realm Integration v0.1 (M7)
 *
 * NOT a new memory subsystem. learning-core/memory/store.js + types.js
 * already implement a real, persisted, tested Memory Engine — separate
 * classes (MemoryClass: WORKING/EPISODIC/SEMANTIC/PROJECT/PREFERENCE/
 * LEARNED_PATTERN/PROVENANCE), provenance (source/source_reference),
 * independent confidence/truth_state fields, supersession-over-deletion.
 * That already satisfies this milestone's requirements (see the master
 * build spec's own instruction: "if a later implementation already
 * exists... preserve it if compatible" — Part VI/X). Rebuilding it
 * here would be exactly the unnecessary duplication that instruction
 * forbids.
 *
 * This file is the thin, explicit bridge: it maps realm-chain objects
 * (KnowledgeRecord, Hypothesis, a Verification result) onto the
 * EXISTING createMemoryRecord()/store.remember() contract, storing the
 * full original object as `content` (memory/types.js never
 * type-checks `content`, so nothing about the object's shape is lost
 * or summarized) and reusing existing fields (`related_entities`,
 * `source_reference`, `confidence`, `truth_state`) rather than
 * inventing new ones. No changes to memory/store.js or memory/types.js.
 *
 * === truth_state mapping is explicit, not guessed ===
 * A KnowledgeRecord's own truth_state is already a valid TruthState
 * value (it was carried forward unchanged from the Proposition that
 * produced it — see knowledgeRealm.js) and passes straight through.
 * A Hypothesis has no truth_state of its own; storing one always uses
 * TruthState.HYPOTHESIS, which is exactly what it is. A Verification
 * result's VerificationOutcome is mapped to the closest existing
 * TruthState value on purpose (VERIFIED -> VERIFIED, CONTRADICTED ->
 * FAILED — the existing "verification attempted and failed" meaning)
 * rather than adding a redundant new TruthState value; every other
 * outcome (PARTIALLY_VERIFIED/UNKNOWN/NOT_VERIFIABLE) maps to
 * TruthState.UNKNOWN, the honest default, never invented.
 */

const store = require("./store");
const { MemoryClass, TruthState, VerificationOutcome } = require("../shared/constants");

function entityIdsOf(record) {
  const ids = [];
  if (record.subject && record.subject.id) ids.push(record.subject.id);
  if (record.object && record.object.id) ids.push(record.object.id);
  return ids;
}

// Stores a KnowledgeRecord (or any Proposition/derived-record-shaped
// object with subject/object/predicate/truth_state/confidence) into
// the existing Memory Engine, defaulting to the SEMANTIC class (facts
// about the world) — callers may pass a different MemoryClass, e.g.
// WORKING for a record only relevant to the current turn.
function storeKnowledgeAsMemory(knowledgeRecord, { memoryClass = MemoryClass.SEMANTIC, userScope = null } = {}) {
  if (!knowledgeRecord || !knowledgeRecord.id) {
    throw new TypeError("storeKnowledgeAsMemory requires a KnowledgeRecord-shaped object with an `id`.");
  }
  return store.remember(memoryClass, {
    type: "knowledge_record",
    content: knowledgeRecord,
    source: knowledgeRecord.provenance ? knowledgeRecord.provenance.realm : "UNKNOWN_REALM",
    sourceReference: knowledgeRecord.id,
    truthState: knowledgeRecord.truth_state || TruthState.UNKNOWN,
    confidence: knowledgeRecord.confidence === undefined ? null : knowledgeRecord.confidence,
    relatedEntities: entityIdsOf(knowledgeRecord),
    userScope,
  });
}

// Stores a Hypothesis. Always truth_state HYPOTHESIS — that is what a
// hypothesis structurally is, never guessed toward KNOWN/VERIFIED.
function storeHypothesisAsMemory(hypothesis, { memoryClass = MemoryClass.WORKING, userScope = null } = {}) {
  if (!hypothesis || !hypothesis.id) {
    throw new TypeError("storeHypothesisAsMemory requires a Hypothesis object with an `id`.");
  }
  return store.remember(memoryClass, {
    type: "hypothesis",
    content: hypothesis,
    source: "HYPOTHESIS_REALM",
    sourceReference: hypothesis.id,
    truthState: TruthState.HYPOTHESIS,
    confidence: hypothesis.confidence === undefined ? null : hypothesis.confidence,
    relatedEntities: hypothesis.proposition && hypothesis.proposition.id ? [hypothesis.proposition.id] : [],
    userScope,
  });
}

const VERIFICATION_TO_TRUTH_STATE = {
  [VerificationOutcome.VERIFIED]: TruthState.VERIFIED,
  [VerificationOutcome.CONTRADICTED]: TruthState.FAILED,
  [VerificationOutcome.PARTIALLY_VERIFIED]: TruthState.UNKNOWN,
  [VerificationOutcome.UNKNOWN]: TruthState.UNKNOWN,
  [VerificationOutcome.NOT_VERIFIABLE]: TruthState.UNKNOWN,
};

// Stores a Verification Realm result as PROVENANCE memory — a record
// of "this claim was checked, here is what was found," itself
// evidence-backed history rather than a restatement of the claim.
function storeVerificationAsMemory(verificationResult, { userScope = null } = {}) {
  if (!verificationResult || !verificationResult.id) {
    throw new TypeError("storeVerificationAsMemory requires a Verification result with an `id` (see verificationRealm.js#verifyClaim).");
  }
  return store.remember(MemoryClass.PROVENANCE, {
    type: "verification_result",
    content: verificationResult,
    source: "VERIFICATION_REALM",
    sourceReference: verificationResult.id,
    truthState: VERIFICATION_TO_TRUTH_STATE[verificationResult.outcome] || TruthState.UNKNOWN,
    confidence: null,
    relatedEntities: [verificationResult.claim_id].filter(Boolean),
    userScope,
  });
}

module.exports = { storeKnowledgeAsMemory, storeHypothesisAsMemory, storeVerificationAsMemory };
