"use strict";

/**
 * Trinity NLP — Token Realm v0.1
 *
 * Converts raw text into an ordered sequence of Token objects, sitting
 * directly above the Symbol Realm (character identity) and Lexical Realm
 * (word-level meaning) in the realm chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ...
 *
 * A token is deliberately minimal at this phase: text, its normalized
 * form, a coarse type, and its exact offsets into the original string.
 * This is intentionally deterministic and dependency-free. Classifying
 * *meaning* (lemma, POS, entity type, ...) is later realms' job — this
 * layer only proves segmentation and ordering are preserved.
 */

const { newTokenId } = require("../../shared/ids");

const TokenType = Object.freeze({
  WORD: "WORD",
  NUMBER: "NUMBER",
  PUNCTUATION: "PUNCTUATION",
  UNKNOWN: "UNKNOWN",
});

const WORD_CHAR = /[A-Za-z]/;
const DIGIT_CHAR = /[0-9]/;
const WHITESPACE_CHAR = /\s/;
// Deliberately conservative: only well-known ASCII punctuation is
// classified as PUNCTUATION. Anything else (emoji, unrecognized unicode
// symbols, control characters) is reported as UNKNOWN rather than guessed.
const PUNCTUATION_CHAR = /[.,!?;:'"()\-\[\]{}/\\]/;

function classify(character) {
  if (WORD_CHAR.test(character)) return TokenType.WORD;
  if (DIGIT_CHAR.test(character)) return TokenType.NUMBER;
  if (PUNCTUATION_CHAR.test(character)) return TokenType.PUNCTUATION;
  return TokenType.UNKNOWN;
}

function createToken(text, start, end, position, type) {
  return {
    id: newTokenId(),
    text,
    normalized: text.toLowerCase(),
    type,
    start,
    end,
    position,
  };
}

// WORD and NUMBER runs merge consecutive same-class characters into one
// token (e.g. "dog" is one token, "42" is one token). PUNCTUATION and
// UNKNOWN characters are never merged, since a run like "?!" or ".." has
// no single deterministic reading at this phase.
const MERGEABLE = new Set([TokenType.WORD, TokenType.NUMBER]);

function tokenize(text) {
  if (typeof text !== "string" || text.length === 0) {
    return {
      state: 0,
      text: text ?? null,
      tokens: [],
      reason: "Input must be a non-empty string.",
    };
  }

  // Iterate by Unicode code point, not UTF-16 code unit, so characters
  // outside the Basic Multilingual Plane (e.g. emoji) are classified and
  // offset as a single character rather than split into surrogate halves.
  const characters = [...text];
  const tokens = [];
  let index = 0; // UTF-16 offset into the original string
  let charIndex = 0; // index into `characters`

  while (charIndex < characters.length) {
    const character = characters[charIndex];

    if (WHITESPACE_CHAR.test(character)) {
      index += character.length;
      charIndex += 1;
      continue;
    }

    const type = classify(character);
    let end = index + character.length;
    let endCharIndex = charIndex + 1;

    if (MERGEABLE.has(type)) {
      while (
        endCharIndex < characters.length &&
        classify(characters[endCharIndex]) === type
      ) {
        end += characters[endCharIndex].length;
        endCharIndex += 1;
      }
    }

    tokens.push(
      createToken(text.slice(index, end), index, end, tokens.length, type)
    );
    index = end;
    charIndex = endCharIndex;
  }

  if (tokens.length === 0) {
    return {
      state: 0,
      text,
      tokens: [],
      reason: "No tokens found (input contains only whitespace).",
    };
  }

  return {
    state: 1,
    text,
    tokens,
    reason: null,
  };
}

module.exports = {
  TokenType,
  classify,
  createToken,
  tokenize,
};
