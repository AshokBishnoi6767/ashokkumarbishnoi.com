"use strict";

/**
 * Trinity NLP — Entity Realm v0.1 (NER foundation)
 *
 * Sits directly above the Syntax Realm in the realm chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ENTITY -> ...
 *
 * Deterministic and dependency-light, like every realm below it. This
 * realm moves from structure to EXPLICIT ENTITY MENTIONS. It does not
 * attempt relationship extraction or semantic interpretation — that is
 * the next architectural boundary (Relationship, then Semantic
 * Representation), not this one.
 *
 * === Mention vs. identity (read this before touching the grouping code) ===
 * `extractEntityMentions` returns MENTIONS: one record per occurrence,
 * grounded in a specific token span. Two mentions of "John" in the same
 * or different text are NEVER merged into "the same John" here — that
 * would be coreference/identity resolution, which is explicitly out of
 * scope this phase (see rule 8 in the milestone spec). `groupMentions-
 * ByCandidateIdentity` performs a separate, clearly-labeled, much
 * weaker operation: it clusters mentions that share the same normalized
 * surface form AND the same type into a "candidate identity" group.
 * That is surface-form clustering, not a claim about the real world —
 * two "John" mentions in a candidate group may well be different
 * people. The Relationship/Coreference realms, working with additional
 * evidence, are what would eventually justify a real identity claim.
 *
 * === How entities are recognized (no unrestricted world-knowledge lookup) ===
 * Three deterministic, structurally-grounded rules, in this order:
 *
 *   1. TOKEN TYPE: a Token Realm NUMBER token is a NUMBER entity. A
 *      NUMBER token immediately followed by a WORD token matching
 *      /^(am|pm)$/i is instead a two-token TIME-of-day expression,
 *      resolved via the EXISTING temporal/parseTimeOfDay.js (reused,
 *      not reimplemented).
 *   2. CLOSED VOCABULARY: the words "today"/"tomorrow"/"yesterday" are
 *      DATE entities, resolved via the EXISTING
 *      temporal/resolve.js#resolveTemporalExpression (reused, not
 *      reimplemented — same "unresolved rather than guessed" contract
 *      it already has).
 *   3. CAPITALIZATION + EXCLUSION, not a proper-noun gazetteer: a WORD
 *      token starting with an uppercase letter is a *candidate* proper
 *      noun UNLESS its normalized form is a known common word (a small
 *      curated COMMON_WORD_SEED, mirroring the POS realm's own
 *      CLOSED_CLASS pattern) or a POS closed-class function word (the
 *      POS realm's own CLOSED_CLASS, reused directly so "The"/"Is"/
 *      "And" are never candidates regardless of sentence position).
 *      This is what correctly excludes "Dog" in "Dog bites man." (a
 *      common noun, capitalized only because it is sentence-initial)
 *      while still admitting "John" in "John works..." (also
 *      sentence-initial, but not a known common word). Consecutive
 *      candidate tokens merge into one multi-token mention.
 *
 * A small curated seed list (PERSON_SEED, ORG_SEED, LOCATION_SEED/
 * LOCATION_SEED_MULTI) plus one structural cue (a trailing
 * organizational suffix word: Inc/Corp/LLC/Ltd/Company/University)
 * assign a specific subtype to a capitalized candidate. This is the
 * same "small, explicit, clearly non-exhaustive, documented" pattern
 * already used for POS's function-word lexicon — NOT a general-purpose
 * gazetteer or external knowledge lookup. A capitalized candidate that
 * matches none of it is still reported as a mention (structurally
 * justified — it behaves like a name), just with the generic ENTITY
 * type rather than an invented, unjustified subtype. UNKNOWN is
 * reserved for a mention whose *shape* is recognized (e.g. a time-of-
 * day expression) but whose value could not actually be resolved.
 */

const { TokenType } = require("./tokenRealm");
const { CLOSED_CLASS } = require("./posRealm");
const { resolveTemporalExpression } = require("../../temporal/resolve");
const { parseTimeOfDay } = require("../../temporal/parseTimeOfDay");
const { newEntityId } = require("../../shared/ids");

const EntityType = Object.freeze({
  PERSON: "PERSON",
  ORGANIZATION: "ORGANIZATION",
  LOCATION: "LOCATION",
  DATE: "DATE",
  TIME: "TIME",
  NUMBER: "NUMBER",
  ENTITY: "ENTITY",
  UNKNOWN: "UNKNOWN",
});

// A small curated set of common words — deliberately NOT an attempt at
// a dictionary. Its only job is to keep ordinary sentence-initial nouns
// (which are capitalized purely by English orthography, not because
// they name something) from being misread as proper nouns.
const COMMON_WORD_SEED = new Set([
  "dog", "dogs", "cat", "cats", "man", "men", "woman", "women",
  "boy", "boys", "girl", "girls", "ball", "balls", "box", "boxes",
  "tree", "trees", "bridge", "bridges", "fish", "bird", "birds",
  "book", "books", "car", "cars", "house", "houses", "table", "tables",
  "chair", "chairs", "team", "teams", "city", "cities", "country",
  "countries", "month", "meeting", "meetings", "event", "events",
  "trip", "trips", "member", "members",
]);

// Deliberately tiny illustrative seed lists — see the module doc above
// for why this is not "unrestricted world-knowledge lookup."
const PERSON_SEED = new Set(["john", "mary", "alice", "bob"]);
const ORG_SEED = new Set(["google", "microsoft", "amazon"]);
const ORG_SUFFIX_WORDS = new Set(["inc", "corp", "llc", "ltd", "company", "university"]);
const LOCATION_SEED = new Set(["toronto", "london", "paris", "canada"]);
const LOCATION_SEED_MULTI = new Set(["new york", "los angeles"]);

const RELATIVE_DATE_WORDS = new Set(["today", "tomorrow", "yesterday"]);
const AM_PM_WORD = /^(am|pm)$/i;

function isProperNounCandidate(token) {
  return (
    token.type === TokenType.WORD &&
    /^[A-Z]/.test(token.text) &&
    !COMMON_WORD_SEED.has(token.normalized) &&
    !Object.prototype.hasOwnProperty.call(CLOSED_CLASS, token.normalized)
  );
}

function classifyProperNounSpan(spanTokens) {
  const normalizedSurface = spanTokens.map((t) => t.normalized).join(" ");
  const lastNormalized = spanTokens[spanTokens.length - 1].normalized;

  if (ORG_SUFFIX_WORDS.has(lastNormalized)) return { type: EntityType.ORGANIZATION, source: "ORG_SUFFIX" };
  if (LOCATION_SEED_MULTI.has(normalizedSurface)) return { type: EntityType.LOCATION, source: "SEED_LOCATION_MULTI" };
  if (ORG_SEED.has(normalizedSurface) || (spanTokens.length === 1 && ORG_SEED.has(lastNormalized))) {
    return { type: EntityType.ORGANIZATION, source: "SEED_ORGANIZATION" };
  }
  if (PERSON_SEED.has(spanTokens[0].normalized)) return { type: EntityType.PERSON, source: "SEED_PERSON" };
  if (spanTokens.length === 1 && LOCATION_SEED.has(lastNormalized)) {
    return { type: EntityType.LOCATION, source: "SEED_LOCATION" };
  }
  return { type: EntityType.ENTITY, source: "STRUCTURAL_PROPER_NOUN" };
}

function makeMention({ text, tokens, startIndex, endIndex, type, source, attributes }) {
  const spanTokens = tokens.slice(startIndex, endIndex);
  const surface = text.slice(spanTokens[0].start, spanTokens[spanTokens.length - 1].end);
  return {
    id: newEntityId(),
    surface,
    normalized: spanTokens.map((t) => t.normalized).join(" "),
    type,
    span: {
      start: spanTokens[0].start,
      end: spanTokens[spanTokens.length - 1].end,
      tokenStart: startIndex,
      tokenEnd: endIndex,
    },
    source,
    attributes: attributes || {},
  };
}

function extractEntityMentions(text, tokens, { now, timezone = "UTC" } = {}) {
  if (typeof text !== "string" || !Array.isArray(tokens)) {
    return [];
  }

  const mentions = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === TokenType.NUMBER) {
      const next = tokens[i + 1];
      if (next && next.type === TokenType.WORD && AM_PM_WORD.test(next.text)) {
        const surfaceGuess = `${token.text} ${next.text}`;
        const parsed = parseTimeOfDay(surfaceGuess);
        mentions.push(
          makeMention({
            text,
            tokens,
            startIndex: i,
            endIndex: i + 2,
            type: parsed.resolved ? EntityType.TIME : EntityType.UNKNOWN,
            source: "TIME_OF_DAY",
            attributes: { resolved: parsed.resolved, time_24h: parsed.time_24h, reason: parsed.reason || null },
          })
        );
        i += 2;
        continue;
      }

      mentions.push(
        makeMention({
          text,
          tokens,
          startIndex: i,
          endIndex: i + 1,
          type: EntityType.NUMBER,
          source: "TOKEN_TYPE_NUMBER",
          attributes: { value: Number.parseInt(token.text, 10) },
        })
      );
      i += 1;
      continue;
    }

    if (token.type === TokenType.WORD) {
      if (RELATIVE_DATE_WORDS.has(token.normalized)) {
        const resolved = resolveTemporalExpression(token.normalized, { now, timezone });
        mentions.push(
          makeMention({
            text,
            tokens,
            startIndex: i,
            endIndex: i + 1,
            type: resolved.resolved ? EntityType.DATE : EntityType.UNKNOWN,
            source: "TEMPORAL_RELATIVE_DATE",
            attributes: { resolved: resolved.resolved, resolved_date: resolved.resolved_date, timezone: resolved.timezone },
          })
        );
        i += 1;
        continue;
      }

      if (isProperNounCandidate(token)) {
        let j = i + 1;
        while (j < tokens.length && isProperNounCandidate(tokens[j])) {
          j += 1;
        }
        const spanTokens = tokens.slice(i, j);
        const { type, source } = classifyProperNounSpan(spanTokens);
        mentions.push(
          makeMention({ text, tokens, startIndex: i, endIndex: j, type, source, attributes: {} })
        );
        i = j;
        continue;
      }
    }

    i += 1;
  }

  return mentions;
}

// Surface-form clustering ONLY — explicitly not coreference/identity
// resolution. See the module doc above.
function groupMentionsByCandidateIdentity(mentions) {
  const groups = new Map();

  for (const mention of mentions) {
    const key = `${mention.type}::${mention.normalized}`;
    if (!groups.has(key)) {
      groups.set(key, {
        candidateId: newEntityId(),
        type: mention.type,
        normalized: mention.normalized,
        mentionIds: [],
        mentions: [],
      });
    }
    const group = groups.get(key);
    group.mentionIds.push(mention.id);
    group.mentions.push(mention);
  }

  return [...groups.values()];
}

module.exports = {
  EntityType,
  extractEntityMentions,
  groupMentionsByCandidateIdentity,
};
