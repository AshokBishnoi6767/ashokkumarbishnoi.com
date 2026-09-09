"use strict";

// STUB, deliberately narrow: a single regex pattern matching one reference
// phrasing family ("create a/an/the <title> <today|tomorrow|yesterday> at
// <time>"). This is NOT a general intent classifier — it exists to prove
// the UNDERSTAND -> PLAN wiring for one concrete request, not to parse
// arbitrary language. Anything that doesn't match this shape is reported
// as unmatched, never guessed.
const PATTERN = /create\s+(?:an?|the)\s+(.+?)\s+(today|tomorrow|yesterday)\s+at\s+([\d:]+\s*(?:am|pm)?)/i;

function titleCase(phrase) {
  return phrase
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractCalendarCreateIntent(text) {
  if (typeof text !== "string") {
    return { matched: false, reason: "Non-text input." };
  }
  const match = text.match(PATTERN);
  if (!match) {
    return { matched: false, reason: "Text does not match the recognized 'create <title> <day> at <time>' pattern." };
  }
  return {
    matched: true,
    title: titleCase(match[1]),
    dayExpression: match[2].toLowerCase(),
    timeExpression: match[3].trim(),
  };
}

module.exports = { extractCalendarCreateIntent };
