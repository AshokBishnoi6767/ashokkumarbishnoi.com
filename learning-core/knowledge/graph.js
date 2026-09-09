"use strict";

// Smallest mechanism that proves the idea: relationships as (subject,
// predicate, object) triples with provenance, instead of storing knowledge
// only as isolated text chunks. In-memory for Phase 1; the shape carries
// over unchanged if this later moves to a graph DB or Firestore documents.
const triples = [];

function assertRelationship(subject, predicate, object, { source, confidence } = {}) {
  const triple = {
    subject,
    predicate,
    object,
    source: source || "unknown",
    confidence: confidence === undefined ? null : confidence,
    created_at: new Date().toISOString(),
  };
  triples.push(triple);
  return triple;
}

function queryRelationships({ subject, predicate, object } = {}) {
  return triples.filter(
    (t) =>
      (subject === undefined || t.subject === subject) &&
      (predicate === undefined || t.predicate === predicate) &&
      (object === undefined || t.object === object)
  );
}

function _reset() {
  triples.length = 0;
}

module.exports = { assertRelationship, queryRelationships, _reset };
