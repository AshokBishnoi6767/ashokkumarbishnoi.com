"use strict";

/**
 * Trinity NLP — POS (Part-of-Speech) Realm v0.1
 *
 * Sits directly above the Morphology Realm in the realm chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ...
 *
 * Deterministic and dependency-free, like every realm below it. A word's
 * part of speech is decided from three kinds of evidence, in this order,
 * and NONE of them attach a confidence or probability number — a POS
 * candidate is either supported by evidence or it is not represented:
 *
 *   1. CLOSED_CLASS lexicon — function words (determiners, pronouns,
 *      prepositions, conjunctions, auxiliaries) whose category is a
 *      lexical fact, not something inflection reveals. Several entries
 *      are deliberately multi-tag ("that" -> DET/PRON/CONJ, "can" ->
 *      AUX/NOUN) because that ambiguity is real, not a gap in the list.
 *   2. MORPHOLOGY — the Morphology Realm's candidate features are
 *      grouped by their pos_hint. Distinct morphological features that
 *      map to the *same* POS tag collapse into one POS candidate (e.g.
 *      "chased"'s PAST_TENSE/PAST_PARTICIPLE ambiguity is a tense
 *      question, not a POS question, once both resolve to VERB).
 *   3. CONTEXT — a small set of hard, deterministic grammatical
 *      constraints applied using the immediately preceding token's
 *      ALREADY-RESOLVED tag, and only when that tag is itself
 *      unambiguous (a single candidate). Two constraints are
 *      implemented at this phase:
 *        - a finite verb cannot immediately follow a determiner, so a
 *          determiner narrows a following NOUN/VERB morphological
 *          ambiguity down to NOUN;
 *        - a determiner with no morphological evidence at all narrows
 *          an entirely open question down to {NOUN, ADJ} (still two
 *          candidates — a determiner doesn't distinguish those two);
 *        - an unambiguous auxiliary/modal is very likely followed by a
 *          bare-form verb.
 *      These are hard syntactic facts about what CAN follow what, not
 *      statistical heuristics, so they carry no numeric weight either.
 *
 * When none of the three layers produce a candidate, this realm reports
 * an empty candidate list rather than defaulting to the statistically
 * most common tag (e.g. NOUN) — doing that would be an unjustified guess
 * with no evidence behind it, and no frequency/statistical model exists
 * in the engine yet (that is Phase 8, Probability, not this phase).
 */

const { TokenType } = require("./tokenRealm");
const { analyzeToken: analyzeTokenMorphology } = require("./morphologyRealm");

const POSTag = Object.freeze({
  NOUN: "NOUN",
  VERB: "VERB",
  ADJ: "ADJ",
  ADV: "ADV",
  DET: "DET",
  PRON: "PRON",
  PREP: "PREP",
  CONJ: "CONJ",
  AUX: "AUX",
  PART: "PART",
  NUM: "NUM",
  PUNCT: "PUNCT",
});

// A deliberately small, curated closed-class lexicon — not an attempt at
// completeness. Multi-tag entries encode genuine grammatical ambiguity
// that this phase does not try to resolve (that is the Syntax realm's
// job, working from more than one token of context).
const CLOSED_CLASS = Object.freeze({
  the: [POSTag.DET],
  a: [POSTag.DET],
  an: [POSTag.DET],
  every: [POSTag.DET],
  each: [POSTag.DET],
  no: [POSTag.DET],
  this: [POSTag.DET, POSTag.PRON],
  that: [POSTag.DET, POSTag.PRON, POSTag.CONJ],
  these: [POSTag.DET, POSTag.PRON],
  those: [POSTag.DET, POSTag.PRON],
  some: [POSTag.DET, POSTag.PRON],
  any: [POSTag.DET, POSTag.PRON],
  which: [POSTag.DET, POSTag.PRON],
  what: [POSTag.DET, POSTag.PRON],
  his: [POSTag.DET, POSTag.PRON],
  her: [POSTag.DET, POSTag.PRON],
  its: [POSTag.DET],
  my: [POSTag.DET],
  your: [POSTag.DET],
  our: [POSTag.DET],
  their: [POSTag.DET],

  i: [POSTag.PRON],
  you: [POSTag.PRON],
  he: [POSTag.PRON],
  she: [POSTag.PRON],
  it: [POSTag.PRON],
  we: [POSTag.PRON],
  they: [POSTag.PRON],
  me: [POSTag.PRON],
  him: [POSTag.PRON],
  us: [POSTag.PRON],
  them: [POSTag.PRON],
  who: [POSTag.PRON],
  whom: [POSTag.PRON],
  whose: [POSTag.PRON],

  in: [POSTag.PREP],
  on: [POSTag.PREP],
  at: [POSTag.PREP],
  by: [POSTag.PREP],
  with: [POSTag.PREP],
  from: [POSTag.PREP],
  of: [POSTag.PREP],
  into: [POSTag.PREP],
  onto: [POSTag.PREP],
  under: [POSTag.PREP],
  over: [POSTag.PREP],
  about: [POSTag.PREP],
  between: [POSTag.PREP],
  through: [POSTag.PREP],
  during: [POSTag.PREP],
  to: [POSTag.PREP, POSTag.PART],
  before: [POSTag.PREP, POSTag.CONJ, POSTag.ADV],
  after: [POSTag.PREP, POSTag.CONJ],

  and: [POSTag.CONJ],
  but: [POSTag.CONJ],
  or: [POSTag.CONJ],
  because: [POSTag.CONJ],
  although: [POSTag.CONJ],
  unless: [POSTag.CONJ],
  so: [POSTag.CONJ, POSTag.ADV],
  while: [POSTag.CONJ],
  if: [POSTag.CONJ],

  is: [POSTag.AUX],
  am: [POSTag.AUX],
  are: [POSTag.AUX],
  was: [POSTag.AUX],
  were: [POSTag.AUX],
  be: [POSTag.AUX],
  been: [POSTag.AUX],
  being: [POSTag.AUX],
  will: [POSTag.AUX, POSTag.NOUN],
  would: [POSTag.AUX],
  shall: [POSTag.AUX],
  should: [POSTag.AUX],
  can: [POSTag.AUX, POSTag.NOUN],
  could: [POSTag.AUX],
  may: [POSTag.AUX, POSTag.NOUN],
  might: [POSTag.AUX],
  must: [POSTag.AUX],
  do: [POSTag.AUX, POSTag.VERB],
  does: [POSTag.AUX, POSTag.VERB],
  did: [POSTag.AUX, POSTag.VERB],
  have: [POSTag.AUX, POSTag.VERB],
  has: [POSTag.AUX, POSTag.VERB],
  had: [POSTag.AUX, POSTag.VERB],

  not: [POSTag.PART],
});

// Irregular verb forms take no recognizable inflectional suffix (see
// morphologyRealm.js's own documented limitation: "irregular forms are
// not detected at this phase"), so without an entry here they resolve
// to zero POS candidates and stay permanently UNKNOWN even in an
// unambiguous main-verb position ("I saw the man." -> "saw" has no
// suffix morphology could strip). This is a deliberately small,
// curated set of common irregular past-tense/participle forms — the
// same "not an attempt at completeness" philosophy as CLOSED_CLASS
// above — added only where the form is not also a common noun/adjective
// (no genuine ambiguity to preserve), so each entry carries a single
// VERB tag, exactly like an unambiguous CLOSED_CLASS entry. Tense
// (past vs. participle) is not distinguished here, same as morphology's
// own PAST_TENSE/PAST_PARTICIPLE collapse into one POS candidate — that
// is a tense question, not a POS question.
const IRREGULAR_VERB_FORMS = Object.freeze({
  saw: POSTag.VERB,
  seen: POSTag.VERB,
  went: POSTag.VERB,
  gone: POSTag.VERB,
  took: POSTag.VERB,
  taken: POSTag.VERB,
  gave: POSTag.VERB,
  given: POSTag.VERB,
  came: POSTag.VERB,
  wrote: POSTag.VERB,
  written: POSTag.VERB,
  said: POSTag.VERB,
  told: POSTag.VERB,
  found: POSTag.VERB,
  thought: POSTag.VERB,
  knew: POSTag.VERB,
  known: POSTag.VERB,
  got: POSTag.VERB,
  gotten: POSTag.VERB,
  made: POSTag.VERB,
  ate: POSTag.VERB,
  eaten: POSTag.VERB,
  ran: POSTag.VERB,
  sat: POSTag.VERB,
  stood: POSTag.VERB,
  heard: POSTag.VERB,
  felt: POSTag.VERB,
  left: POSTag.VERB,
  brought: POSTag.VERB,
  bought: POSTag.VERB,
  caught: POSTag.VERB,
  taught: POSTag.VERB,
  fought: POSTag.VERB,
  won: POSTag.VERB,
  lost: POSTag.VERB,
  met: POSTag.VERB,
  spoke: POSTag.VERB,
  spoken: POSTag.VERB,
  broke: POSTag.VERB,
  broken: POSTag.VERB,
  chose: POSTag.VERB,
  chosen: POSTag.VERB,
  drove: POSTag.VERB,
  driven: POSTag.VERB,
  flew: POSTag.VERB,
  flown: POSTag.VERB,
  grew: POSTag.VERB,
  grown: POSTag.VERB,
  held: POSTag.VERB,
  kept: POSTag.VERB,
  threw: POSTag.VERB,
  thrown: POSTag.VERB,
  understood: POSTag.VERB,
  wore: POSTag.VERB,
  worn: POSTag.VERB,
  drew: POSTag.VERB,
  drawn: POSTag.VERB,
  began: POSTag.VERB,
  begun: POSTag.VERB,
  rang: POSTag.VERB,
  rung: POSTag.VERB,
  sang: POSTag.VERB,
  sung: POSTag.VERB,
  sank: POSTag.VERB,
  sunk: POSTag.VERB,
  drank: POSTag.VERB,
  drunk: POSTag.VERB,
  swam: POSTag.VERB,
  swum: POSTag.VERB,
  rode: POSTag.VERB,
  ridden: POSTag.VERB,
  rose: POSTag.VERB,
  risen: POSTag.VERB,
  fell: POSTag.VERB,
  fallen: POSTag.VERB,
  forgot: POSTag.VERB,
  forgotten: POSTag.VERB,
  hid: POSTag.VERB,
  hidden: POSTag.VERB,
});

// morphology pos_hint values ("NOUN" | "VERB" | "ADJ") are already POSTag
// spellings — this is intentionally an identity set, kept explicit so a
// future divergence between the two vocabularies fails loudly rather than
// silently mismatching.
const MORPH_HINT_TAGS = new Set([POSTag.NOUN, POSTag.VERB, POSTag.ADJ]);

function candidatesFromMorphology(morphology) {
  if (!morphology || morphology.state !== 1 || morphology.candidates.length === 0) {
    return [];
  }

  const byTag = new Map();
  for (const candidate of morphology.candidates) {
    if (!MORPH_HINT_TAGS.has(candidate.pos_hint)) continue;
    if (!byTag.has(candidate.pos_hint)) byTag.set(candidate.pos_hint, []);
    byTag.get(candidate.pos_hint).push(candidate.feature);
  }

  return [...byTag.entries()].map(([tag, features]) => ({
    tag,
    rule: "MORPHOLOGY",
    source: "MORPHOLOGY",
    morph_features: features,
  }));
}

function hasSingleTag(resolved, tag) {
  return (
    !!resolved &&
    resolved.state === 1 &&
    resolved.candidates.length === 1 &&
    resolved.candidates[0].tag === tag
  );
}

function applyContext(word, candidates, previous) {
  const afterDeterminer = hasSingleTag(previous, POSTag.DET);
  const afterAuxiliary = hasSingleTag(previous, POSTag.AUX);

  if (candidates.length === 0) {
    if (afterDeterminer) {
      return [
        { tag: POSTag.NOUN, rule: "AFTER_DETERMINER", source: "CONTEXT" },
        { tag: POSTag.ADJ, rule: "AFTER_DETERMINER", source: "CONTEXT" },
      ];
    }
    if (afterAuxiliary) {
      return [{ tag: POSTag.VERB, rule: "AFTER_AUX_BARE_VERB", source: "CONTEXT" }];
    }
    return candidates;
  }

  // A finite verb cannot immediately follow a determiner ("the dogs" ->
  // "dogs" cannot be read as a verb here, even though morphology alone
  // is ambiguous between PLURAL(NOUN) and PRESENT_3SG(VERB)). Only
  // narrow when at least one non-verb candidate survives, so this rule
  // can never narrow a set down to nothing.
  if (afterDeterminer && candidates.length > 1 && candidates.some((c) => c.tag === POSTag.VERB)) {
    const narrowed = candidates.filter((c) => c.tag !== POSTag.VERB);
    if (narrowed.length > 0) {
      return narrowed.map((c) => ({
        ...c,
        rule: c.rule + "+AFTER_DETERMINER_EXCLUDES_VERB",
        source: c.source + "+CONTEXT",
      }));
    }
  }

  return candidates;
}

function classifyToken(token, { previous } = {}) {
  if (!token || typeof token !== "object") {
    return {
      state: 0,
      word: null,
      candidates: [],
      reason: "POS classification requires a token object from the Token Realm.",
    };
  }

  if (token.type === TokenType.PUNCTUATION) {
    return {
      state: 1,
      word: token.normalized,
      candidates: [{ tag: POSTag.PUNCT, rule: "TOKEN_TYPE_PUNCTUATION", source: "TOKEN_TYPE" }],
      reason: null,
    };
  }

  if (token.type === TokenType.NUMBER) {
    return {
      state: 1,
      word: token.normalized,
      candidates: [{ tag: POSTag.NUM, rule: "TOKEN_TYPE_NUMBER", source: "TOKEN_TYPE" }],
      reason: null,
    };
  }

  if (token.type !== TokenType.WORD) {
    return {
      state: 0,
      word: token.normalized ?? null,
      candidates: [],
      reason: `POS classification has no rule for token type ${token.type}.`,
    };
  }

  const word = token.normalized;

  let candidates;
  if (Object.prototype.hasOwnProperty.call(CLOSED_CLASS, word)) {
    candidates = CLOSED_CLASS[word].map((tag) => ({
      tag,
      rule: "CLOSED_CLASS_LEXICON",
      source: "LEXICON",
    }));
  } else if (Object.prototype.hasOwnProperty.call(IRREGULAR_VERB_FORMS, word)) {
    candidates = [{ tag: IRREGULAR_VERB_FORMS[word], rule: "IRREGULAR_VERB_LEXICON", source: "LEXICON" }];
  } else {
    candidates = candidatesFromMorphology(analyzeTokenMorphology(token));
  }

  candidates = applyContext(word, candidates, previous);

  return {
    state: 1,
    word,
    candidates,
    reason: candidates.length
      ? null
      : "No lexicon entry, morphological evidence, or contextual rule determines a part of speech for this word at this phase.",
  };
}

function tagSentence(tokens) {
  if (!Array.isArray(tokens)) {
    return [];
  }

  const results = [];
  let previous = null;
  for (const token of tokens) {
    const result = classifyToken(token, { previous });
    results.push(result);
    previous = result;
  }
  return results;
}

module.exports = {
  POSTag,
  CLOSED_CLASS,
  IRREGULAR_VERB_FORMS,
  classifyToken,
  tagSentence,
};
