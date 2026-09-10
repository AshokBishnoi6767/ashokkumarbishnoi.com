"use strict";

/**
 * Trinity NLP — Lexical Realm v0.1
 *
 * Converts a validated character sequence into a lexical word state.
 * This layer is deterministic and intentionally small.
 *
 * Future ML systems may propose lexical candidates, but this module
 * remains responsible for representing and validating lexical states.
 */

function normalizeWord(word) {
  if (typeof word !== "string") {
    return null;
  }

  const normalized = word.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}

function createLexicalEntry(word, properties = {}) {
  const normalized = normalizeWord(word);

  if (!normalized) {
    return {
      state: 0,
      word: null,
      reason: "Lexical entry requires a non-empty word.",
    };
  }

  return {
    state: 1,
    word: normalized,
    lemma: properties.lemma || normalized,
    category: properties.category || null,
    morphology: properties.morphology || "base",
    meaning: properties.meaning || null,
    properties: {
      ...properties,
    },
  };
}

function createLexicon(entries = []) {
  const lexicon = new Map();

  for (const entry of entries) {
    const word = normalizeWord(entry.word);

    if (!word) {
      continue;
    }

    lexicon.set(word, createLexicalEntry(word, entry));
  }

  return lexicon;
}

function lookupWord(word, lexicon) {
  const normalized = normalizeWord(word);

  if (!normalized || !(lexicon instanceof Map)) {
    return {
      state: 0,
      word: normalized,
      candidate: null,
      source: "lexicon",
      reason: "Invalid lexical lookup.",
    };
  }

  const candidate = lexicon.get(normalized);

  if (!candidate) {
    return {
      state: 0,
      word: normalized,
      candidate: null,
      source: "lexicon",
      reason: "Word not present in lexical realm.",
    };
  }

  return {
    state: 1,
    word: normalized,
    candidate,
    source: "lexicon",
    reason: null,
  };
}

module.exports = {
  normalizeWord,
  createLexicalEntry,
  createLexicon,
  lookupWord,
};
