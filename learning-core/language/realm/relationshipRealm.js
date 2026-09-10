"use strict";

/**
 * Trinity NLP — Relationship Realm v0.1
 *
 * Sits directly above the Entity Realm in the realm chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ENTITY
 *   -> RELATIONSHIP -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm's job is narrow: given a clause the Syntax Realm already
 * resolved (a unique verb pivot with a subject span before it and an
 * object span after it) and the entity mentions the Entity Realm
 * already found, emit explicit (subject, predicate, object) triples
 * whose subject/object are REFERENCES to entity-mention-shaped objects
 * (each with its own id), never bare copied strings. It does not
 * interpret what a relationship *means* — that begins at the next
 * boundary (Semantic Representation), not here.
 *
 * === Never manufacture a relationship ===
 * If Syntax could not resolve a unique verb pivot (zero or multiple
 * VERB-candidate tokens), if the subject span has no resolved head, or
 * if the clause is intransitive (no object span at all), this realm
 * reports zero relationships with an explicit reason — it never guesses
 * a subject/object merely because entities happen to appear in the same
 * sentence. Two entities co-occurring in a sentence with no valid
 * clause structure connecting them produce NO relationship.
 *
 * === Subject/object resolution: entity mention first, syntactic head second ===
 * A span's argument is resolved by:
 *   1. an Entity Realm mention whose token span matches exactly, else
 *   2. Syntax's own already-resolved head token (covers non-named
 *      arguments like "Dog"/"man" in "Dog bites man." — common nouns
 *      the Entity Realm correctly does NOT tag as named entities, but
 *      which are still legitimate relationship arguments), wrapped as a
 *      lightweight referent object (never a bare string) with
 *      type UNKNOWN — honest about not being a recognized named entity.
 * A multi-token span with NO resolved head (Syntax already said so, e.g.
 * "red ball" with no determiner) is left UNRESOLVED, not guessed at.
 *
 * === Object chunking: verb + preposition -> compound predicate ===
 * Syntax's "object" is everything after the verb pivot to clause end —
 * it does not strip prepositions ("works at Google" -> object tokens
 * are ["at","Google"], and Syntax's own head-for-that-span is null,
 * since "at Google" isn't a DET+ADJ*+NOUN pattern). This realm is
 * allowed new evidence Syntax didn't have: an unambiguous leading
 * preposition (POS closed-class PREP) immediately followed by a
 * resolvable argument folds the preposition into the predicate
 * ("WORKS" + "AT" -> "WORKS_AT") and the following argument becomes the
 * object. The object span is walked repeatedly this way — a
 * transitive-with-one-object clause emits one relationship, a clause
 * whose object span contains two [PREP, argument] chunks in sequence
 * ("works at Google in Toronto") emits two relationships sharing the
 * same subject and verb. Any leftover chunk that is neither a resolved
 * entity mention nor a lone remaining token is reported as unresolved,
 * never guessed.
 *
 * === On knowledge/graph.js ===
 * knowledge/graph.js's assertRelationship() stores {subject, predicate,
 * object} as plain STRINGS with a "confidence" field. This realm's
 * contract (per its own requirements) must reference entity-mention
 * OBJECTS, not strings, and this milestone must not introduce any new
 * confidence value. Rather than changing knowledge/graph.js's shape (an
 * architecture change outside this milestone's scope) or bolting a
 * placeholder confidence onto it, this realm reuses only the
 * subject/predicate/object NAMING CONVENTION and produces its own
 * self-contained Relationship objects. A later, separate milestone can
 * add a thin string-projecting adapter into the existing triple store
 * if that integration is ever wanted — nothing here forecloses it, and
 * nothing here required changing the existing knowledge architecture.
 */

const { TokenType } = require("./tokenRealm");
const { POSTag, CLOSED_CLASS } = require("./posRealm");
const { parseSentence } = require("./syntaxRealm");
const { EntityType, extractEntityMentions } = require("./entityRealm");
const { newEntityId, newRelationshipId } = require("../../shared/ids");

function isUnambiguousPreposition(token) {
  if (!token || token.type !== TokenType.WORD) return false;
  const entry = CLOSED_CLASS[token.normalized];
  return !!entry && entry.length === 1 && entry[0] === POSTag.PREP;
}

function bareReferent(token, index) {
  return {
    id: newEntityId(),
    surface: token.text,
    normalized: token.normalized,
    type: EntityType.UNKNOWN,
    span: { start: token.start, end: token.end, tokenStart: index, tokenEnd: index + 1 },
    source: "SYNTAX_HEAD",
    attributes: {},
  };
}

function findEntityMentionAt(entityMentions, tokenIndex) {
  return entityMentions.find((m) => m.span.tokenStart === tokenIndex) || null;
}

function resolveSubjectArgument(subjectPhrase, tokens, entityMentions) {
  if (!subjectPhrase) {
    return {
      argument: null,
      reason: "Clause has no subject span (e.g. an imperative); a relationship requires an explicit subject.",
    };
  }

  const startIndex = tokens.indexOf(subjectPhrase.tokens[0]);
  const endIndex = startIndex + subjectPhrase.tokens.length;
  const fullSpanMatch = entityMentions.find((m) => m.span.tokenStart === startIndex && m.span.tokenEnd === endIndex);
  if (fullSpanMatch) return { argument: fullSpanMatch, reason: null };

  if (!subjectPhrase.head) {
    return {
      argument: null,
      reason: "Subject phrase has no resolved head (multi-token span did not match a recognized NP pattern); cannot determine a relationship subject without guessing.",
    };
  }

  const headIndex = tokens.indexOf(subjectPhrase.head);
  const headMatch = entityMentions.find((m) => m.span.tokenStart === headIndex && m.span.tokenEnd === headIndex + 1);
  if (headMatch) return { argument: headMatch, reason: null };

  return { argument: bareReferent(subjectPhrase.head, headIndex), reason: null };
}

function buildRelationship(subjectArg, predicate, objectArg, verbToken, preposition) {
  return {
    id: newRelationshipId(),
    subject: subjectArg,
    predicate,
    object: objectArg,
    source: "SYNTAX_SVO",
    span: {
      start: Math.min(subjectArg.span.start, objectArg.span.start),
      end: Math.max(subjectArg.span.end, objectArg.span.end),
      tokenStart: Math.min(subjectArg.span.tokenStart, objectArg.span.tokenStart),
      tokenEnd: Math.max(subjectArg.span.tokenEnd, objectArg.span.tokenEnd),
    },
    attributes: { verb: verbToken.text, preposition: preposition ? preposition.normalized : null },
  };
}

// Walks the object span left to right, peeling off [optional PREP] +
// [argument] chunks. One chunk => one relationship, sharing the same
// subject/verb. Stops (without guessing) the moment a chunk cannot be
// resolved, recording it as unresolved rather than dropping it silently.
function extractObjectRelationships(objectPhrase, subjectArg, verbToken, tokens, entityMentions) {
  const relationships = [];
  const unresolved = [];

  let pointer = tokens.indexOf(objectPhrase.tokens[0]);
  const end = pointer + objectPhrase.tokens.length;
  const verbUpper = verbToken.normalized.toUpperCase();

  while (pointer < end) {
    let preposition = null;
    if (isUnambiguousPreposition(tokens[pointer])) {
      preposition = tokens[pointer];
      pointer += 1;
    }

    if (pointer >= end) {
      unresolved.push({
        span: { tokenStart: pointer - 1, tokenEnd: end },
        reason: "A leading preposition has no following object; cannot determine a relationship object without guessing.",
      });
      break;
    }

    const entityMatch = findEntityMentionAt(entityMentions, pointer);
    if (entityMatch && entityMatch.span.tokenEnd <= end) {
      const predicate = preposition ? `${verbUpper}_${preposition.normalized.toUpperCase()}` : verbUpper;
      relationships.push(buildRelationship(subjectArg, predicate, entityMatch, verbToken, preposition));
      pointer = entityMatch.span.tokenEnd;
      continue;
    }

    const remaining = end - pointer;
    if (remaining === 1) {
      const referent = bareReferent(tokens[pointer], pointer);
      const predicate = preposition ? `${verbUpper}_${preposition.normalized.toUpperCase()}` : verbUpper;
      relationships.push(buildRelationship(subjectArg, predicate, referent, verbToken, preposition));
      pointer = end;
      continue;
    }

    unresolved.push({
      span: { tokenStart: pointer, tokenEnd: end },
      reason: "Multi-token remainder has no leading-preposition-headed entity and is not a single bare token; cannot determine an object without guessing.",
    });
    break;
  }

  return { relationships, unresolved };
}

function extractRelationships(text, tokens, options = {}) {
  if (typeof text !== "string" || !Array.isArray(tokens)) {
    return { state: 0, relationships: [], ambiguous: false, unresolved: [], reason: "Relationship extraction requires source text and a token array from the Token Realm." };
  }

  const parsed = parseSentence(tokens);
  if (parsed.state !== 1) {
    return { state: 0, relationships: [], ambiguous: false, unresolved: [], reason: parsed.reason };
  }

  const { clause } = parsed;
  if (clause.state !== 1) {
    return {
      state: 1,
      relationships: [],
      ambiguous: clause.ambiguous,
      unresolved: [],
      reason: clause.reason,
    };
  }

  const entityMentions = extractEntityMentions(text, tokens, options);

  const subjectResolution = resolveSubjectArgument(clause.subject, tokens, entityMentions);
  if (!subjectResolution.argument) {
    return { state: 1, relationships: [], ambiguous: false, unresolved: [], reason: subjectResolution.reason };
  }

  if (!clause.object) {
    return {
      state: 1,
      relationships: [],
      ambiguous: false,
      unresolved: [],
      reason: "Clause has no object span (intransitive verb); no relationship object to report.",
    };
  }

  const { relationships, unresolved } = extractObjectRelationships(
    clause.object,
    subjectResolution.argument,
    clause.verb.token,
    tokens,
    entityMentions
  );

  return {
    state: 1,
    relationships,
    ambiguous: false,
    unresolved,
    reason: relationships.length ? null : unresolved[0]?.reason || "No resolvable relationship object found.",
  };
}

module.exports = { extractRelationships };
