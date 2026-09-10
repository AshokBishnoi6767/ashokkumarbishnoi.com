"use strict";

/**
 * Trinity NLP — Morphology Realm v0.1
 *
 * Sits directly above the Token Realm in the realm chain:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ...
 *
 * Given a single word, this realm proposes deterministic, rule-based
 * inflectional analyses (stem + candidate morphological features). It is a
 * small suffix-stripping analyzer, NOT a complete morphological analyzer:
 * irregular forms (ran, mice, better) match no rule and are reported with
 * zero candidates rather than a guessed one. That is a deliberate design
 * choice, not a bug — this realm never invents an analysis it cannot
 * derive from the surface form.
 *
 * Many English suffixes are genuinely ambiguous without syntax (a later
 * realm's job): "-s" can mark a plural noun or a present-tense verb;
 * "-ed" can mark simple past or a past participle; "-ing" can mark a
 * gerund (noun) or a progressive verb; "-er" can mark a comparative
 * adjective or an agentive noun. Where a suffix is genuinely ambiguous at
 * this phase, this realm returns multiple competing candidates rather
 * than silently picking one — consistent with the engine-wide rule that
 * ambiguity must be represented, not resolved by guessing.
 */

const { normalizeWord } = require("./lexicalRealm");
const { TokenType } = require("./tokenRealm");

const MorphFeature = Object.freeze({
  PLURAL: "PLURAL",
  PRESENT_3SG: "PRESENT_3SG",
  PAST_TENSE: "PAST_TENSE",
  PAST_PARTICIPLE: "PAST_PARTICIPLE",
  GERUND: "GERUND",
  PROGRESSIVE: "PROGRESSIVE",
  COMPARATIVE: "COMPARATIVE",
  SUPERLATIVE: "SUPERLATIVE",
  AGENTIVE_NOUN: "AGENTIVE_NOUN",
});

// Consonants excluded from doubling-undo, per the classic English spelling
// rule this mirrors (Porter step 1b): a trailing double l/s/z is usually
// part of the base word itself ("hiss", "fizz", "spell"), not a doubled
// consonant introduced before adding -ing/-ed/-er/-est ("run" -> "running").
const DOUBLING_EXCLUDED = new Set(["l", "s", "z"]);

function isConsonant(ch) {
  return /[a-z]/.test(ch) && !"aeiou".includes(ch);
}

// Porter's formal consonant/vowel definition (1980): a letter is a
// consonant unless it is a,e,i,o,u, or "y" preceded by a consonant. This
// recursive rule is what makes "toy" classify Y as a consonant (preceded
// by the vowel O) while "syzygy" classifies its Ys as vowels.
function isConsonantAt(word, i) {
  const ch = word[i];
  if ("aeiou".includes(ch)) return false;
  if (ch !== "y") return true;
  return i === 0 ? true : !isConsonantAt(word, i - 1);
}

// Porter's "measure" m of a stem: the number of adjacent vowel-run ->
// consonant-run transitions in its collapsed C/V pattern, e.g. TREES has
// pattern CVC (m=1), so does CATS; a longer stem like CONSULT has pattern
// CVCVC (m=2). This is a well-defined deterministic count, not a guess.
function measure(stem) {
  let pattern = "";
  for (let i = 0; i < stem.length; i++) {
    const symbol = isConsonantAt(stem, i) ? "C" : "V";
    if (pattern[pattern.length - 1] !== symbol) pattern += symbol;
  }
  let m = 0;
  for (let i = 0; i < pattern.length - 1; i++) {
    if (pattern[i] === "V" && pattern[i + 1] === "C") m += 1;
  }
  return m;
}

// English regularly drops a silent "e" before -ed/-ing/-er/-est
// ("chase" -> "chased", "hope" -> "hoping", "late" -> "later") and
// doubles a final consonant after a short stressed vowel ("run" ->
// "running"). Undoing that on the way back to the stem requires deciding,
// deterministically, which (if either) transformation applies — this
// mirrors Porter stemmer step 1b exactly, as three mutually exclusive
// cases (never both) rather than sequential heuristics:
function restoreStem(stem) {
  if (stem.endsWith("at") || stem.endsWith("bl") || stem.endsWith("iz")) {
    return stem + "e";
  }

  const last = stem[stem.length - 1];
  const secondLast = stem[stem.length - 2];
  if (stem.length >= 2 && last === secondLast && isConsonant(last) && !DOUBLING_EXCLUDED.has(last)) {
    return stem.slice(0, -1);
  }

  const thirdLast = stem[stem.length - 3];
  const isCVC =
    stem.length >= 3 &&
    isConsonant(thirdLast) &&
    !isConsonant(secondLast) &&
    isConsonant(last) &&
    !"wxy".includes(last);
  if (isCVC && measure(stem) === 1) {
    return stem + "e";
  }

  return stem;
}

function analyzeMorphology(word) {
  const normalized = normalizeWord(word);

  if (!normalized) {
    return {
      state: 0,
      word: null,
      stem: null,
      candidates: [],
      reason: "Morphology analysis requires a non-empty word.",
    };
  }

  if (!/^[a-z]+$/.test(normalized)) {
    return {
      state: 0,
      word: normalized,
      stem: null,
      candidates: [],
      reason: "Morphology analysis only supports single alphabetic words at this phase.",
    };
  }

  let stem = null;
  let candidateSpecs = null;

  if (normalized.endsWith("ies") && normalized.length > 4) {
    stem = normalized.slice(0, -3) + "y";
    candidateSpecs = [
      { feature: MorphFeature.PLURAL, pos_hint: "NOUN", rule: "PLURAL_IES" },
      { feature: MorphFeature.PRESENT_3SG, pos_hint: "VERB", rule: "PRESENT_3SG_IES" },
    ];
  } else if (
    /(?:[sxz]es|(?:ch|sh)es)$/.test(normalized) &&
    normalized.length > 4
  ) {
    stem = normalized.slice(0, -2);
    candidateSpecs = [
      { feature: MorphFeature.PLURAL, pos_hint: "NOUN", rule: "PLURAL_ES_SIBILANT" },
      { feature: MorphFeature.PRESENT_3SG, pos_hint: "VERB", rule: "PRESENT_3SG_ES_SIBILANT" },
    ];
  } else if (
    normalized.endsWith("s") &&
    !normalized.endsWith("ss") &&
    normalized.length > 2
  ) {
    stem = normalized.slice(0, -1);
    candidateSpecs = [
      { feature: MorphFeature.PLURAL, pos_hint: "NOUN", rule: "PLURAL_S" },
      { feature: MorphFeature.PRESENT_3SG, pos_hint: "VERB", rule: "PRESENT_3SG_S" },
    ];
  } else if (normalized.endsWith("ied") && normalized.length > 4) {
    stem = normalized.slice(0, -3) + "y";
    candidateSpecs = [
      { feature: MorphFeature.PAST_TENSE, pos_hint: "VERB", rule: "PAST_TENSE_IED" },
      { feature: MorphFeature.PAST_PARTICIPLE, pos_hint: "VERB", rule: "PAST_PARTICIPLE_IED" },
    ];
  } else if (
    normalized.endsWith("ed") &&
    !normalized.endsWith("eed") &&
    normalized.length > 3
  ) {
    stem = restoreStem(normalized.slice(0, -2));
    candidateSpecs = [
      { feature: MorphFeature.PAST_TENSE, pos_hint: "VERB", rule: "PAST_TENSE_ED" },
      { feature: MorphFeature.PAST_PARTICIPLE, pos_hint: "VERB", rule: "PAST_PARTICIPLE_ED" },
    ];
  } else if (normalized.endsWith("ing") && normalized.length > 4) {
    stem = restoreStem(normalized.slice(0, -3));
    candidateSpecs = [
      { feature: MorphFeature.GERUND, pos_hint: "NOUN", rule: "GERUND_ING" },
      { feature: MorphFeature.PROGRESSIVE, pos_hint: "VERB", rule: "PROGRESSIVE_ING" },
    ];
  } else if (normalized.endsWith("est") && normalized.length > 4) {
    stem = restoreStem(normalized.slice(0, -3));
    candidateSpecs = [
      { feature: MorphFeature.SUPERLATIVE, pos_hint: "ADJ", rule: "SUPERLATIVE_EST" },
    ];
  } else if (normalized.endsWith("er") && normalized.length > 3) {
    stem = restoreStem(normalized.slice(0, -2));
    candidateSpecs = [
      { feature: MorphFeature.COMPARATIVE, pos_hint: "ADJ", rule: "COMPARATIVE_ER" },
      { feature: MorphFeature.AGENTIVE_NOUN, pos_hint: "NOUN", rule: "AGENTIVE_ER" },
    ];
  }

  const candidates = candidateSpecs
    ? candidateSpecs.map((spec) => ({ ...spec, stem }))
    : [];

  return {
    state: 1,
    word: normalized,
    stem: candidates.length ? stem : normalized,
    candidates,
    reason: candidates.length
      ? null
      : "No inflectional suffix pattern matched; treated as an uninflected base form. This does not confirm the word is morphologically simple (irregular forms are not detected at this phase).",
  };
}

function analyzeToken(token) {
  if (!token || typeof token !== "object") {
    return {
      state: 0,
      word: null,
      stem: null,
      candidates: [],
      reason: "Morphology analysis requires a token object from the Token Realm.",
    };
  }

  if (token.type !== TokenType.WORD) {
    return {
      state: 0,
      word: token.normalized ?? null,
      stem: null,
      candidates: [],
      reason: `Morphology analysis only applies to WORD tokens (received ${token.type}).`,
    };
  }

  return analyzeMorphology(token.normalized);
}

module.exports = {
  MorphFeature,
  analyzeMorphology,
  analyzeToken,
};
