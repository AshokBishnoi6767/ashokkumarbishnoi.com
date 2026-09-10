"use strict";

/**
 * Trinity — Generative / Language Generation Realm v0.1 (M10)
 *
 * The reverse direction of the realm chain built so far:
 *
 *   SEMANTIC REPRESENTATION -> MESSAGE STRUCTURE -> SENTENCE PLANNING
 *   -> LEXICAL SELECTION -> GRAMMAR -> SURFACE TEXT
 *
 * generateSurfaceText() takes a Proposition/KnowledgeRecord/derived-
 * record-shaped object ({subject, predicate, object}, all already
 * resolved upstream) and renders it back to English. It is
 * deterministic and template-based BY CONSTRUCTION: since the only
 * inputs it ever reads are the record's own subject/predicate/object/
 * truth_state fields, it is structurally incapable of adding an
 * unsupported fact — there is no path in this code for content not
 * already present in the record to appear in the output.
 *
 * === LLMs are a separate, optional backend — not used here ===
 * This module never calls model/registry.js or any LLM provider. Per
 * the master build's own principle ("the deterministic core must
 * remain functional without an LLM"), template-based generation for
 * the shapes this codebase actually produces (SVO propositions, math
 * results) needs no model call at all. A future GENERATIVE_LLM
 * backend, routed through the Model Router (M13), would be a
 * DIFFERENT function a caller opts into for open-ended text — not a
 * hidden dependency of this one.
 *
 * === Predicate lexicon: a small, explicit, documented table ===
 * Predicates below are the ones the Relationship/Reasoning Realms are
 * actually observed to produce (see relationshipRealm.js /
 * reasoningRealm.js). An unmapped predicate falls back to a purely
 * mechanical detokenization (SOME_PREDICATE -> "some predicate") —
 * never a guessed meaning, and the result is marked
 * `lexical_selection: "FALLBACK"` so a caller can tell the difference
 * from a real, curated mapping.
 *
 * === Derived claims stay visibly derived ===
 * A record with truth_state DERIVED (see reasoningRealm.js) renders
 * with an explicit "(derived)" marker — generated text preserves the
 * source semantic state rather than presenting a derived claim
 * identically to an observed one.
 */

const { TruthState } = require("../../shared/constants");

const PREDICATE_LEXICON = Object.freeze({
  BITES: "bites",
  WORKS_AT: "works at",
  WORKS_IN: "works in",
  WORKS_WITH: "works with",
  IS_A: "is a",
  CAN: "can",
  IS: "is",
  LOCATED_IN: "is located in",
  HOME_CITY: "has home city",
});

function verbPhraseFor(predicate) {
  if (PREDICATE_LEXICON[predicate]) {
    return { phrase: PREDICATE_LEXICON[predicate], lexical_selection: "LEXICON" };
  }
  const mechanical = predicate.toLowerCase().replace(/_/g, " ");
  return { phrase: mechanical, lexical_selection: "FALLBACK" };
}

function capitalize(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Generates one declarative sentence from a record's subject/predicate/
// object. Only sentence type supported today (message structure) —
// no questions/imperatives; that is out of scope for this milestone,
// not silently faked.
function generateSurfaceText(record) {
  if (!record || !record.subject || !record.predicate || !record.object) {
    throw new TypeError("generateSurfaceText requires a record with subject, predicate, and object.");
  }
  const subjectSurface = record.subject.surface;
  const objectSurface = record.object.surface;
  if (typeof subjectSurface !== "string" || typeof objectSurface !== "string") {
    throw new TypeError("generateSurfaceText requires subject.surface and object.surface strings.");
  }

  const { phrase, lexical_selection } = verbPhraseFor(record.predicate);
  const derivedMarker = record.truth_state === TruthState.DERIVED ? "(derived) " : "";
  const text = `${derivedMarker}${capitalize(subjectSurface)} ${phrase} ${objectSurface}.`;

  return {
    text,
    message_structure: "DECLARATIVE",
    sentence_planning: { order: ["subject", "predicate", "object"] },
    lexical_selection,
    preserves_truth_state: record.truth_state || TruthState.UNKNOWN,
    provenance: {
      realm: "LANGUAGE_GENERATION",
      generated_at: new Date().toISOString(),
    },
  };
}

// Renders a Mathematical Engine result (see math/engine.js) as a
// readable expression — a second, distinct output kind (mathematical
// expressions, not language), still purely downstream of a structured
// internal representation.
function generateMathExpression(mathResult) {
  if (!mathResult || typeof mathResult.operator !== "string") {
    throw new TypeError("generateMathExpression requires a math/engine.js result object.");
  }
  if (!mathResult.valid) {
    return { text: `${mathResult.operator} is undefined (${mathResult.error}).`, valid: false };
  }
  const { a, b } = mathResult.input;
  const SYMBOL = { ADD: "+", SUBTRACT: "-", MULTIPLY: "x", DIVIDE: "/" };
  if (SYMBOL[mathResult.operator] && a !== undefined && b !== undefined) {
    return { text: `${a} ${SYMBOL[mathResult.operator]} ${b} = ${mathResult.output}`, valid: true };
  }
  return { text: `${mathResult.operator}(${JSON.stringify(mathResult.input)}) = ${JSON.stringify(mathResult.output)}`, valid: true };
}

module.exports = { generateSurfaceText, generateMathExpression };
