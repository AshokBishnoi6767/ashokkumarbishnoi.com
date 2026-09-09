"use strict";

// STUBs in the exact same spirit as calendarIntent.js: narrow, deterministic
// regex patterns for a few concrete phrasings — never a general NLU claim.
// This is what lets preference/decision/correction capture work identically
// whether or not a real model provider is connected, the same way calendar
// creation does. Anything that doesn't match one of these shapes falls
// through to the model (when connected) exactly like any other free-form
// message — it is never guessed into a memory write.

const CORRECTION_PATTERNS = [
  /^no,?\s+actually,?\s+(.+)$/i,
  /^that'?s\s+wrong,?\s+(.+)$/i,
  /^correction:\s*(.+)$/i,
  /^actually,?\s+(.+)$/i,
];

function extractCorrection(text) {
  if (typeof text !== "string") return { matched: false, reason: "Non-text input." };
  const trimmed = text.trim();
  for (const pattern of CORRECTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return { matched: true, statement: cleanStatement(match[1]) };
  }
  return { matched: false, reason: "Text does not match a recognized correction pattern." };
}

const DECISION_PATTERNS = [
  /^we\s+decided\s+(?:to\s+)?(.+)$/i,
  /^(?:the\s+)?decision\s*(?:is|:)\s*(.+)$/i,
  /^let'?s\s+go\s+with\s+(.+)$/i,
  /^we'?re\s+going\s+with\s+(.+)$/i,
];

function extractDecisionStatement(text) {
  if (typeof text !== "string") return { matched: false, reason: "Non-text input." };
  const trimmed = text.trim();
  for (const pattern of DECISION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return { matched: true, statement: cleanStatement(match[1]) };
  }
  return { matched: false, reason: "Text does not match a recognized decision pattern." };
}

const PREFERENCE_PATTERNS = [
  /^(?:please\s+)?(?:always\s+)?remember(?:\s+that)?\s+i\s+prefer\s+(.+)$/i,
  /^i\s+prefer\s+(.+)$/i,
  /^my\s+preference\s+is\s+(.+)$/i,
  /^please\s+always\s+(.+)$/i,
  /^from\s+now\s+on,?\s+(.+)$/i,
];

function extractPreferenceStatement(text) {
  if (typeof text !== "string") return { matched: false, reason: "Non-text input." };
  const trimmed = text.trim();
  for (const pattern of PREFERENCE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return { matched: true, statement: cleanStatement(match[1]) };
  }
  return { matched: false, reason: "Text does not match a recognized preference-statement pattern." };
}

function cleanStatement(fragment) {
  return fragment.trim().replace(/[.!]+$/, "");
}

module.exports = { extractCorrection, extractDecisionStatement, extractPreferenceStatement };
