"use strict";

/**
 * Trinity NLP — Symbol Realm v0.1
 *
 * The Symbol Realm represents the smallest written-language units
 * handled by the engine.
 *
 * This is intentionally deterministic and dependency-free.
 */

const ALPHABET = new Set(
  "abcdefghijklmnopqrstuvwxyz".split("")
);

function createSymbol(character, position = 0) {
  if (typeof character !== "string" || character.length !== 1) {
    return {
      state: 0,
      symbol: null,
      position,
      reason: "A symbol must contain exactly one character.",
    };
  }

  const normalized = character.toLowerCase();

  if (!ALPHABET.has(normalized)) {
    return {
      state: 0,
      symbol: character,
      normalized,
      position,
      reason: "Character is outside the English alphabet.",
    };
  }

  return {
    state: 1,
    symbol: character,
    normalized,
    position,
  };
}

function createSequence(text) {
  if (typeof text !== "string" || text.length === 0) {
    return {
      state: 0,
      symbols: [],
      text: text ?? null,
      reason: "Input must be a non-empty string.",
    };
  }

  const symbols = [...text].map((character, index) =>
    createSymbol(character, index)
  );

  const invalid = symbols.find((symbol) => symbol.state === 0);

  return {
    state: invalid ? 0 : 1,
    text,
    normalized: text.toLowerCase(),
    symbols,
    reason: invalid ? invalid.reason : null,
  };
}

module.exports = {
  ALPHABET,
  createSymbol,
  createSequence,
};
