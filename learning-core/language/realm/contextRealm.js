"use strict";

/**
 * Trinity NLP — Context Representation Realm v0.1
 *
 * Sits directly above the Knowledge Query Realm in the realm chain:
 *
 *   ... -> KNOWLEDGE REPRESENTATION -> KNOWLEDGE QUERY
 *   -> CONTEXT REPRESENTATION -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: assemble a single, explicit snapshot (a
 * ContextFrame) of what is actually known about the current situation
 * from the pieces the caller already has in hand — the current input,
 * preceding inputs, speaker/listener, time/place, active entities,
 * active propositions, active knowledge records, task, and session id.
 * It does NOT reason, does NOT rank relevance, and does NOT resolve
 * coreference. That begins at a later boundary (Reasoning), not here.
 *
 * === Context != coreference resolution (read this before touching this file) ===
 * "John called him." must not result in this realm deciding who "him"
 * refers to. `detectUnresolvedReferences` finds pronoun tokens
 * structurally (reusing the POS Realm's existing PRON tag — not a new
 * classifier) and records each one as UNRESOLVED. It never attaches a
 * referent, guessed or otherwise: there is no "referent" field on an
 * unresolved reference, because a field that is always null would
 * misleadingly imply resolution was attempted and failed. Resolving
 * identity is explicitly a later realm's job (Reasoning), never this
 * one's.
 *
 * === Context != context/engine.js#assembleContext ===
 * That pre-existing module (used by the product dashboard's Personal
 * Intelligence Layer) mixes conversation/memory/knowledge into one
 * bundle and explicitly defers real relevance ranking to a later
 * phase. This realm is not that assembler and does not replace it: it
 * is the deterministic-realm-chain building block — Entity mentions,
 * Proposition and KnowledgeRecord objects flow in as object references,
 * never strings, and nothing here ranks or filters them. This realm
 * does not import from, write to, or modify context/engine.js in any
 * way. Naming it "Context Representation" (matching this milestone's
 * spec) rather than folding it into the existing "Context" module
 * keeps the two namespaces distinct on purpose, exactly as
 * knowledgeRealm.js did with knowledge/graph.js one boundary down.
 *
 * === Known vs. unknown, made explicit ===
 * Every ContextFrame carries `known_state` and `unknown_state`: the
 * list of top-level fields that were actually populated vs. the list
 * that were not. This is the field-level version of this realm's
 * central rule — context stores what is known about the current
 * situation, and never guesses what is unknown. A scalar field
 * (speaker, listener, time, place, task, session_id, current_input) is
 * "known" only when the caller explicitly supplied a non-null value;
 * an array field (preceding_inputs, active_entities,
 * active_propositions, active_knowledge) is "known" only when it is
 * non-empty. Nothing here fabricates a default for either case.
 *
 * === No accidental truth promotion ===
 * Proposition and KnowledgeRecord objects are carried into
 * `active_propositions` / `active_knowledge` by reference, completely
 * unchanged — this realm never reads, sets, or recalculates
 * truth_state, confidence, probability, or uncertainty on them, and
 * the ContextFrame itself carries no epistemic fields of its own.
 * Assembling context is not evidence of truth.
 */

const { POSTag, tagSentence } = require("./posRealm");
const { TokenType } = require("./tokenRealm");

const CONTEXT_FIELDS = [
  "session_id",
  "current_input",
  "preceding_inputs",
  "speaker",
  "listener",
  "time",
  "place",
  "task",
  "active_entities",
  "active_propositions",
  "active_knowledge",
];

const ARRAY_FIELDS = new Set(["preceding_inputs", "active_entities", "active_propositions", "active_knowledge"]);

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array (pass [] if there are none).`);
  }
  return value;
}

// Pure structural detection: a token the POS Realm tags as a candidate
// PRON is an unresolved reference. Reuses posRealm.tagSentence rather
// than reimplementing pronoun recognition. Returns [] when no tokens
// are supplied — this realm never requires tokens to build a frame.
function detectUnresolvedReferences(tokens) {
  if (tokens === undefined || tokens === null) return [];
  requireArray(tokens, "tokens");
  if (tokens.length === 0) return [];

  const posResults = tagSentence(tokens);
  const unresolved = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const posResult = posResults[i];
    if (!token || token.type !== TokenType.WORD || !posResult) continue;
    const candidateTags = posResult.candidates.map((c) => c.tag);
    if (!candidateTags.includes(POSTag.PRON)) continue;
    unresolved.push({
      token_index: i,
      surface: token.text,
      span: { start: token.start, end: token.end },
      candidate_tags: candidateTags,
      status: "UNRESOLVED",
    });
  }
  return unresolved;
}

function fieldIsKnown(field, value) {
  if (ARRAY_FIELDS.has(field)) return Array.isArray(value) && value.length > 0;
  return value !== null && value !== undefined;
}

// Pure assembly: given whatever pieces the caller already has, produce
// one explicit ContextFrame. Every input is carried forward by
// reference, in its original order — never reordered, deduplicated,
// merged, or used to infer a value for a field the caller did not
// supply.
function buildContextFrame({
  sessionId = null,
  currentInput = null,
  precedingInputs = [],
  speaker = null,
  listener = null,
  time = null,
  place = null,
  task = null,
  activeEntities = [],
  activePropositions = [],
  activeKnowledge = [],
  tokens,
} = {}) {
  requireArray(precedingInputs, "precedingInputs");
  requireArray(activeEntities, "activeEntities");
  requireArray(activePropositions, "activePropositions");
  requireArray(activeKnowledge, "activeKnowledge");

  const frame = {
    session_id: sessionId,
    current_input: currentInput,
    preceding_inputs: precedingInputs,
    speaker,
    listener,
    time,
    place,
    task,
    active_entities: activeEntities,
    active_propositions: activePropositions,
    active_knowledge: activeKnowledge,
    unresolved_references: detectUnresolvedReferences(tokens),
  };

  frame.known_state = CONTEXT_FIELDS.filter((field) => fieldIsKnown(field, frame[field]));
  frame.unknown_state = CONTEXT_FIELDS.filter((field) => !fieldIsKnown(field, frame[field]));
  frame.provenance = {
    realm: "CONTEXT_REPRESENTATION",
    assembled_at: new Date().toISOString(),
  };

  return frame;
}

module.exports = { buildContextFrame, detectUnresolvedReferences };
