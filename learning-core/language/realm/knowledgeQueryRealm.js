"use strict";

/**
 * Trinity NLP — Knowledge Query Realm v0.1
 *
 * Sits directly above the Knowledge Representation Realm in the realm
 * chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ENTITY
 *   -> RELATIONSHIP -> SEMANTIC REPRESENTATION -> KNOWLEDGE REPRESENTATION
 *   -> KNOWLEDGE QUERY -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: given KnowledgeRecord objects the Knowledge
 * Realm already produced, look them up by exact structural criteria
 * (subject id/surface, predicate, object id/surface, entity type,
 * truth_state). It does not rank relevance, does not merge or
 * deduplicate matches, does not resolve contradictions, and does not
 * decide which of several matching records is "the" answer. Relevance
 * ranking for context assembly is explicitly future work (see
 * context/engine.js's own comment: "A later phase adds real relevance
 * ranking; this phase establishes the shape") — this realm does not
 * attempt it. That is deliberately scoped to a later boundary
 * (Context Assembly / Reasoning / Verification), not this one.
 *
 * === Query, not context assembly ===
 * "Context" in this codebase already means something specific:
 * context/engine.js#assembleContext mixes conversation, memory, and
 * knowledge into one ranked bundle for a request. This realm is not
 * that — it is the deterministic building block a future context
 * assembler could call to actually fetch "relevant_knowledge" once
 * ranking is added, not the assembler itself. Naming it narrowly as a
 * Query realm (rather than folding it into "Context") keeps this
 * milestone's surface area to exactly what is deterministic: exact
 * filtering, nothing else.
 *
 * === Not knowledge/graph.js's queryRelationships either ===
 * That module's queryRelationships({subject, predicate, object}) filters
 * plain STRING triples. This realm's records carry entity-mention
 * OBJECT references (each with its own id/type/surface), so a plain
 * string-equality filter cannot express "find everything about this
 * specific John, not just any mention whose surface is 'John'" — hence
 * separate subjectId/objectId (exact identity) vs. subjectSurface/
 * objectSurface (surface-form match, case-insensitive) criteria below.
 * This realm reuses the naming convention only, exactly as the
 * Relationship Realm did with the same module one boundary down.
 *
 * === Purity and ordering ===
 * Every function here is a pure read over the array it is given: no
 * global state, no mutation of the input, and matches are always
 * returned in their original relative order — never reordered,
 * deduplicated, or merged. A query with no matches returns an empty
 * array, never null/undefined (the same convention memory/store.js and
 * knowledge/graph.js already use). Two structurally-identical or
 * outright contradictory records both come back from a query that
 * matches them — this realm inherits the Knowledge Realm's "never
 * silently merge" guarantee rather than undoing it.
 */

function matchesCriteria(record, criteria) {
  if (criteria.subjectId !== undefined && record.subject.id !== criteria.subjectId) return false;
  if (criteria.objectId !== undefined && record.object.id !== criteria.objectId) return false;
  if (criteria.predicate !== undefined && record.predicate !== criteria.predicate) return false;
  if (criteria.subjectType !== undefined && record.subject.type !== criteria.subjectType) return false;
  if (criteria.objectType !== undefined && record.object.type !== criteria.objectType) return false;
  if (criteria.truthState !== undefined && record.truth_state !== criteria.truthState) return false;
  if (
    criteria.subjectSurface !== undefined &&
    record.subject.surface.toLowerCase() !== criteria.subjectSurface.toLowerCase()
  ) {
    return false;
  }
  if (
    criteria.objectSurface !== undefined &&
    record.object.surface.toLowerCase() !== criteria.objectSurface.toLowerCase()
  ) {
    return false;
  }
  return true;
}

// Pure filter: returns the subsequence of `records` matching every
// provided criterion (AND semantics). Omitted criteria are wildcards.
// Never reorders, never merges, never mutates `records`.
function queryKnowledge(records, criteria = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError("queryKnowledge requires an array of KnowledgeRecord objects.");
  }
  return records.filter((record) => matchesCriteria(record, criteria));
}

// Exact lookup by the record's own id. Returns null (not undefined,
// not a throw) when nothing matches — the same "unknown id" convention
// memory/store.js#recall already uses.
function getKnowledgeById(records, id) {
  if (!Array.isArray(records)) {
    throw new TypeError("getKnowledgeById requires an array of KnowledgeRecord objects.");
  }
  return records.find((record) => record.id === id) || null;
}

// Grouping indexes: a deterministic Map from a key to the (in-order,
// unmerged) records sharing it. Building an index is just a
// convenience over repeated queryKnowledge calls — it recognizes no
// new equivalence and merges nothing.
function indexKnowledgeBySubject(records) {
  return buildIndex(records, (record) => record.subject.id);
}

function indexKnowledgeByObject(records) {
  return buildIndex(records, (record) => record.object.id);
}

function indexKnowledgeByPredicate(records) {
  return buildIndex(records, (record) => record.predicate);
}

function buildIndex(records, keyFn) {
  if (!Array.isArray(records)) {
    throw new TypeError("Indexing requires an array of KnowledgeRecord objects.");
  }
  const index = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  }
  return index;
}

module.exports = {
  queryKnowledge,
  getKnowledgeById,
  indexKnowledgeBySubject,
  indexKnowledgeByObject,
  indexKnowledgeByPredicate,
};
