"use strict";

// STUB (Phase 1 minimal implementation). This is not a real NLP/intent
// model — it exists so the Context Engine and Reasoning layers have a
// stable contract shape to depend on before a real model is wired in
// (Phase 6, Model Router). Ambiguity is represented explicitly rather than
// silently resolved, per the non-negotiable principle.
function understand(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return {
      intent: null,
      entities: [],
      ambiguous: true,
      ambiguity_reason: "Empty or non-text input.",
      requested_outcome: null,
    };
  }

  const trimmed = text.trim();
  const isQuestion = /\?\s*$/.test(trimmed);
  const hasUnresolvedReference = !isQuestion && /\b(it|that|this|them)\b/i.test(trimmed);

  return {
    intent: isQuestion ? "QUESTION" : "STATEMENT",
    entities: [],
    ambiguous: hasUnresolvedReference,
    ambiguity_reason: hasUnresolvedReference
      ? "Contains an unresolved pronoun/reference; no coreference tracking exists at this phase."
      : null,
    requested_outcome: null,
  };
}

module.exports = { understand };
