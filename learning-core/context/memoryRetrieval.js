"use strict";

// Relevance-based memory retrieval: deterministic keyword-overlap scoring,
// not a vector/embedding search — this is the "smallest mechanism that
// proves the idea" for the same reason calendarIntent.js is a regex and not
// an LLM call. It is enough to prove real, testable retrieval (only
// relevant records come back, ranked, never everything) without pretending
// there's a semantic search index that doesn't exist.
//
// user_scope is REQUIRED and is the entire cross-user isolation boundary
// here: a missing scope returns nothing rather than defaulting to "all
// memory", and every candidate is filtered by exact scope match before
// scoring ever runs.
const memoryStore = require("../memory/store");
const { MemoryClass } = require("../shared/constants");

const DEFAULT_CLASSES = [MemoryClass.PREFERENCE, MemoryClass.PROJECT, MemoryClass.SEMANTIC, MemoryClass.EPISODIC, MemoryClass.LEARNED_PATTERN];
const STOPWORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "to", "of", "and", "or", "for", "in", "on", "at", "it", "this", "that"]);

function tokenize(text) {
  const words = (text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function scoreOverlap(recordContent, queryTokens) {
  const recordTokens = new Set(tokenize(recordContent));
  let score = 0;
  for (const token of queryTokens) {
    if (recordTokens.has(token)) score++;
  }
  return score;
}

// Only ever returns records for the given userScope, never fabricated, and
// never everything — a query with zero token overlap against a memory
// returns nothing for it, so irrelevant memory is never injected just
// because it exists.
function retrieveRelevantMemory({ userScope, text, classes = DEFAULT_CLASSES, limit = 5 } = {}) {
  if (!userScope || typeof text !== "string" || !text.trim()) return [];

  const queryTokens = tokenize(text);
  if (queryTokens.length === 0) return [];

  const candidates = classes.flatMap((memoryClass) =>
    memoryStore.query(memoryClass, (r) => r.user_scope === userScope && r.status !== "superseded").map((record) => ({ record, memoryClass }))
  );

  return candidates
    .map((entry) => ({ ...entry, score: scoreOverlap(entry.record.content, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (a.record.created_at < b.record.created_at ? 1 : -1))
    .slice(0, limit)
    // memory_class is tagged on so a caller (e.g. supersession on correction)
    // can call memoryStore.update()/forget() without having to guess which
    // class's Map the record actually lives in.
    .map((entry) => ({ ...entry.record, relevance_score: entry.score, memory_class: entry.memoryClass }));
}

// Same scan, restricted to a single class — used when capturing a new
// preference/decision/correction to find what it might supersede, without
// pulling in unrelated classes.
function retrieveRelevantMemoryInClass({ userScope, text, memoryClass, limit = 3 } = {}) {
  return retrieveRelevantMemory({ userScope, text, classes: [memoryClass], limit });
}

module.exports = { retrieveRelevantMemory, retrieveRelevantMemoryInClass };
