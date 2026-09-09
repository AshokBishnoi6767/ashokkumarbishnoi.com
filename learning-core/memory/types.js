"use strict";

const { newMemoryId } = require("../shared/ids");
const { TruthState } = require("../shared/constants");

function createMemoryRecord({
  type,
  content,
  source,
  sourceReference,
  context,
  confidence,
  truthState,
  status,
  relatedEntities,
  relatedMemories,
  project,
  userScope,
  expiresAt,
}) {
  if (!type) {
    throw new TypeError("Memory record requires a type (see shared/constants MemoryClass).");
  }
  if (truthState && !TruthState[truthState]) {
    throw new TypeError(`Unknown truth_state: ${truthState}`);
  }
  const now = new Date().toISOString();
  return {
    memory_id: newMemoryId(),
    type,
    content,
    source: source || "unknown",
    source_reference: sourceReference || null,
    created_at: now,
    updated_at: now,
    context: context || null,
    // Confidence (a probability) and truth_state (known/unknown/verified/...)
    // are kept as separate fields on purpose — never collapse one into the
    // other.
    confidence: confidence === undefined ? null : confidence,
    truth_state: truthState || TruthState.UNKNOWN,
    status: status || "active",
    related_entities: relatedEntities || [],
    related_memories: relatedMemories || [],
    project: project || null,
    user_scope: userScope || null,
    expires_at: expiresAt || null,
  };
}

module.exports = { createMemoryRecord };
