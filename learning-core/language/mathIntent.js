"use strict";

// STUB-style, deliberately narrow — same discipline as calendarIntent.js:
// recognizes exactly one shape (the ENTIRE message, once a question
// wrapper like "what is"/"calculate" and trailing punctuation are
// stripped, is a single closed-form arithmetic expression) rather than
// scanning for numbers anywhere in free text. That full-string match is
// what keeps this from misfiring on ordinary prose containing numbers
// ("I need 2-3 examples" never matches — the full stripped string is not
// purely "2-3", it still has surrounding words). Multi-operator or
// algebraic input is reported unmatched, never guessed at.

const QUESTION_WRAPPER = /^(?:what\s+is|what's|whats|calculate|compute|solve)\s+/i;
const TRAILING_PUNCT = /[?.!]+$/;

const OPERATORS = { "+": "add", "-": "subtract", "*": "multiply", x: "multiply", "×": "multiply", "/": "divide", "÷": "divide" };

const BINARY_PATTERN = /^(-?\d+(?:\.\d+)?)\s*([+\-*x×/÷])\s*(-?\d+(?:\.\d+)?)$/;
const SQRT_PATTERN = /^(?:sqrt(?:\s+of)?|square\s+root\s+of)\s*\(?(-?\d+(?:\.\d+)?)\)?$/i;

function strip(text) {
  return text.trim().replace(TRAILING_PUNCT, "").trim().replace(QUESTION_WRAPPER, "").trim();
}

function extractArithmeticIntent(text) {
  if (typeof text !== "string") {
    return { matched: false, reason: "Non-text input." };
  }
  const core = strip(text);

  const binary = core.match(BINARY_PATTERN);
  if (binary) {
    const [, left, opSymbol, right] = binary;
    return {
      matched: true,
      operation: OPERATORS[opSymbol.toLowerCase()],
      params: [Number(left), Number(right)],
      expression: `${left} ${opSymbol} ${right}`,
    };
  }

  const sqrt = core.match(SQRT_PATTERN);
  if (sqrt) {
    return { matched: true, operation: "sqrt", params: [Number(sqrt[1])], expression: `sqrt(${sqrt[1]})` };
  }

  return { matched: false, reason: "Text is not a single recognized closed-form arithmetic expression." };
}

module.exports = { extractArithmeticIntent };
