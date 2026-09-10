"use strict";

/**
 * Trinity NLP — Syntax Realm v0.1
 *
 * Sits directly above the POS Realm in the realm chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ...
 *
 * Deterministic and dependency-free, like every realm below it. This
 * realm establishes STRUCTURE only — noun-phrase chunks and a minimal
 * SUBJECT -> VERB -> OBJECT clause shape. It does not attempt semantic
 * interpretation (who/what something refers to, what a relationship
 * *means*): that begins at the next architectural boundary (Entity/NER,
 * Relationship, Semantic Representation), not here.
 *
 * Structural inference beyond POS: the POS Realm decides a token's tag
 * using only the single immediately preceding token's ALREADY-RESOLVED
 * tag. This realm is allowed to use more structure than that — an
 * active DET + ADJ* chunk, or a clause's unique verb pivot — without
 * ever rewriting what the POS Realm concluded. A token whose POS
 * candidates are still empty (no lexicon entry, no morphology, no local
 * context) can still be resolved as an NP head or clause argument here,
 * because *this* realm has evidence the POS layer never had access to:
 * its structural position relative to a determiner or a verb. That is
 * new evidence, not a guess, and it is always labeled with the rule
 * that produced it.
 *
 * Word order matters throughout: "Dog bites man." and "Man bites dog."
 * share every token's individual POS candidates, but the SUBJECT/OBJECT
 * assignment below is purely positional relative to the verb, so the
 * two sentences produce swapped, and therefore different, structures.
 *
 * Scope of this phase, stated plainly:
 *   - one sentence (i.e. one array of Token Realm tokens) at a time;
 *     splitting raw text into sentences is not this realm's job.
 *   - NP chunking recognizes exactly DET + ADJ* + NOUN, started only by
 *     an UNAMBIGUOUS determiner. A closed-class word that is ambiguously
 *     DET among other tags (e.g. "that") does not start a chunk here.
 *   - Clause structure recognizes exactly one subject span before, and
 *     one object span after, a single unambiguous verb pivot: the one
 *     token in the clause whose POS candidates include VERB. Zero such
 *     tokens, or more than one, is reported as unresolved rather than
 *     guessed — this is the same "never force it" principle used by
 *     every realm below.
 *   - A phrase span longer than one token is only assigned a head when
 *     it matches the DET + ADJ* + NOUN pattern exactly across its whole
 *     span. If a token within that span carries both ADJ and NOUN among
 *     its POS candidates, this realm treats it as the (conservative,
 *     shortest) head rather than assuming the phrase continues further
 *     — it does not attempt multi-token lookahead disambiguation. Any
 *     other multi-token span is reported with head = null, not guessed.
 */

const { TokenType } = require("./tokenRealm");
const { POSTag, tagSentence } = require("./posRealm");

function isUnambiguousTag(posResult, tag) {
  return (
    !!posResult &&
    posResult.state === 1 &&
    posResult.candidates.length === 1 &&
    posResult.candidates[0].tag === tag
  );
}

function includesTag(posResult, tag) {
  return !!posResult && posResult.state === 1 && posResult.candidates.some((c) => c.tag === tag);
}

function hasNoEvidence(posResult) {
  return !!posResult && posResult.state === 1 && posResult.candidates.length === 0;
}

// Scans left to right for DET -> ADJ* -> NOUN(head) runs. Returns
// index-based chunks (start inclusive, end exclusive) so callers can
// match a chunk against an arbitrary token span without re-scanning.
function findNounPhrasesIndexed(tokens, posResults) {
  const phrases = [];
  let i = 0;

  while (i < tokens.length) {
    if (!isUnambiguousTag(posResults[i], POSTag.DET)) {
      i += 1;
      continue;
    }

    const detIndex = i;
    const modifiers = [];
    let j = i + 1;

    while (j < tokens.length) {
      const pos = posResults[j];
      if (includesTag(pos, POSTag.NOUN) || hasNoEvidence(pos)) break;
      if (includesTag(pos, POSTag.ADJ)) {
        modifiers.push(j);
        j += 1;
        continue;
      }
      break;
    }

    const headFound = j < tokens.length && (includesTag(posResults[j], POSTag.NOUN) || hasNoEvidence(posResults[j]));

    if (headFound) {
      phrases.push({
        start: detIndex,
        end: j + 1,
        det: detIndex,
        modifiers,
        head: j,
        headInferredFromPosition: hasNoEvidence(posResults[j]),
        rule: "DET_ADJSTAR_NOUN",
      });
      i = j + 1;
    } else {
      // No head noun found before the pattern broke (e.g. "the quickly
      // ran" has no noun to close the phrase). Move past the
      // determiner only; do not force an NP where none is justified.
      i = detIndex + 1;
    }
  }

  return phrases;
}

function phraseFromIndices(tokens, phrase) {
  return {
    tokens: tokens.slice(phrase.start, phrase.end),
    det: tokens[phrase.det],
    modifiers: phrase.modifiers.map((idx) => tokens[idx]),
    head: tokens[phrase.head],
    headInferredFromPosition: phrase.headInferredFromPosition,
    rule: phrase.rule,
  };
}

function findNounPhrases(tokens) {
  if (!Array.isArray(tokens)) return [];
  const posResults = tagSentence(tokens);
  return findNounPhrasesIndexed(tokens, posResults).map((p) => phraseFromIndices(tokens, p));
}

// The clause's verb pivot: the unique token (by index) whose POS
// candidates include VERB. Zero or multiple such tokens means the
// clause's structure is not determinable at this phase.
function findVerbPivot(tokens, posResults) {
  const candidates = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type !== TokenType.WORD) continue;
    if (includesTag(posResults[i], POSTag.VERB)) candidates.push(i);
  }

  if (candidates.length === 0) {
    return {
      index: null,
      ambiguous: false,
      candidateIndexes: candidates,
      reason: "No token carries a VERB candidate; clause structure cannot be established.",
    };
  }

  if (candidates.length > 1) {
    return {
      index: null,
      ambiguous: true,
      candidateIndexes: candidates,
      reason: "Multiple tokens carry a VERB candidate; selecting a single main verb without further syntactic evidence would be a guess.",
    };
  }

  return { index: candidates[0], ambiguous: false, candidateIndexes: candidates, reason: null };
}

// Resolves the head of an arbitrary contiguous span (a clause's subject
// or object). A single-token span is trivially its own head. A
// multi-token span is only resolved when it matches a recognized NP
// chunk across its ENTIRE span; otherwise head stays null (unresolved),
// never guessed (e.g. "picked as the last word").
function resolvePhraseSpan(tokens, startIndex, endIndexExclusive, nounPhrasesIndexed) {
  const span = tokens.slice(startIndex, endIndexExclusive);
  if (span.length === 0) return null;

  if (span.length === 1) {
    return { tokens: span, head: span[0], nounPhrase: null, reason: null };
  }

  const match = nounPhrasesIndexed.find((p) => p.start === startIndex && p.end === endIndexExclusive);
  if (match) {
    return {
      tokens: span,
      head: tokens[match.head],
      nounPhrase: phraseFromIndices(tokens, match),
      reason: null,
    };
  }

  return {
    tokens: span,
    head: null,
    nounPhrase: null,
    reason: "Multi-token phrase does not match a recognized DET+ADJ*+NOUN pattern; head is not determined at this phase.",
  };
}

function parseSentence(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return {
      state: 0,
      nounPhrases: [],
      clause: null,
      reason: "Syntax parsing requires a non-empty token array from the Token Realm.",
    };
  }

  const posResults = tagSentence(tokens);
  const nounPhrasesIndexed = findNounPhrasesIndexed(tokens, posResults);
  const nounPhrases = nounPhrasesIndexed.map((p) => phraseFromIndices(tokens, p));

  // A clause excludes trailing sentence punctuation (".", "!", "?", ...)
  // from its subject/verb/object span.
  let clauseEnd = tokens.length;
  while (clauseEnd > 0 && tokens[clauseEnd - 1].type === TokenType.PUNCTUATION) {
    clauseEnd -= 1;
  }

  const pivot = findVerbPivot(tokens.slice(0, clauseEnd), posResults.slice(0, clauseEnd));

  if (pivot.index === null) {
    return {
      state: 1,
      nounPhrases,
      clause: {
        state: 0,
        subject: null,
        verb: null,
        object: null,
        ambiguous: pivot.ambiguous,
        verbCandidates: pivot.candidateIndexes.map((i) => tokens[i]),
        reason: pivot.reason,
      },
      reason: null,
    };
  }

  const subject = resolvePhraseSpan(tokens, 0, pivot.index, nounPhrasesIndexed);
  const object = resolvePhraseSpan(tokens, pivot.index + 1, clauseEnd, nounPhrasesIndexed);

  return {
    state: 1,
    nounPhrases,
    clause: {
      state: 1,
      subject,
      verb: { token: tokens[pivot.index], candidates: posResults[pivot.index].candidates },
      object,
      ambiguous: false,
      reason: null,
    },
    reason: null,
  };
}

module.exports = {
  findNounPhrases,
  parseSentence,
};
