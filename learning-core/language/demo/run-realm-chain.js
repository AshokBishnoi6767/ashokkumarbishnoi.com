"use strict";

/**
 * Deterministic demonstration of the realm chain built so far:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS
 *
 * Run with: node learning-core/language/demo/run-realm-chain.js
 *
 * This is not a test (see ../../test/*.test.js for the assertions this
 * demo's claims are backed by) — it is a readable trace of the same
 * behavior, for manual inspection.
 */

const { createSequence } = require("../realm/symbolRealm");
const { tokenize, TokenType } = require("../realm/tokenRealm");
const { analyzeToken } = require("../realm/morphologyRealm");
const { classifyToken, tagSentence } = require("../realm/posRealm");

function section(title) {
  console.log("\n=== " + title + " ===");
}

section("1. Symbol Realm: order is preserved, not summed (DOG vs GOD)");
const dog = createSequence("DOG");
const god = createSequence("GOD");
console.log("DOG ->", dog.symbols.map((s) => s.normalized).join(""));
console.log("GOD ->", god.symbols.map((s) => s.normalized).join(""));
console.log(
  "Same letters, different order => different sequence:",
  dog.symbols.map((s) => s.normalized).join("") !== god.symbols.map((s) => s.normalized).join("")
);

section("2. Token Realm: word order distinguishes subject/object");
const dogBitesMan = tokenize("Dog bites man.");
const manBitesDog = tokenize("Man bites dog.");
console.log("'Dog bites man.' ->", dogBitesMan.tokens.map((t) => t.normalized));
console.log("'Man bites dog.' ->", manBitesDog.tokens.map((t) => t.normalized));

section("3. Morphology Realm: genuinely ambiguous suffixes are represented as competing candidates, not guessed");
for (const word of ["dogs", "walked", "running", "faster"]) {
  const token = dogBitesMan.tokens.find((t) => t.normalized === word) ||
    { text: word, normalized: word, type: TokenType.WORD };
  const result = analyzeToken(token);
  console.log(
    `${word} -> stem="${result.stem}", candidates=`,
    result.candidates.map((c) => `${c.feature}(${c.pos_hint})`)
  );
}

section("4. Morphology Realm: irregular forms are reported as UNKNOWN inflection, never guessed");
const ran = analyzeToken({ text: "ran", normalized: "ran", type: TokenType.WORD });
console.log("ran -> candidates=", ran.candidates, "| reason:", ran.reason);

section("5. Full chain on one sentence: TOKEN -> MORPHOLOGY per WORD token");
const sentence = tokenize("The dogs chased the fastest cat.");
for (const token of sentence.tokens) {
  if (token.type !== TokenType.WORD) continue;
  const morph = analyzeToken(token);
  console.log(
    `"${token.text}" -> stem="${morph.stem}", candidates=`,
    morph.candidates.map((c) => c.feature)
  );
}

section("6. POS Realm: standalone words that genuinely have multiple grammatical roles");
for (const word of ["that", "to", "before", "can", "should", "faster", "running"]) {
  const token = { text: word, normalized: word, type: TokenType.WORD };
  const result = classifyToken(token);
  console.log(`${word} ->`, result.candidates.map((c) => `${c.tag}[${c.source}]`));
}

section("7. POS Realm: context narrows word-level ambiguity using hard grammatical constraints, not statistics");
const should = classifyToken({ text: "should", normalized: "should", type: TokenType.WORD });
const run = classifyToken({ text: "run", normalized: "run", type: TokenType.WORD }, { previous: should });
console.log("'should' ->", should.candidates.map((c) => c.tag), "(unambiguous AUX)");
console.log("'run' after 'should' ->", run.candidates.map((c) => `${c.tag} (${c.rule})`));

const can = classifyToken({ text: "can", normalized: "can", type: TokenType.WORD });
const fish = classifyToken({ text: "fish", normalized: "fish", type: TokenType.WORD }, { previous: can });
console.log("'can' ->", can.candidates.map((c) => c.tag), "(AMBIGUOUS: AUX or NOUN)");
console.log(
  "'fish' after 'can' -> candidates=",
  fish.candidates,
  "(no context rule fires because 'can' itself is ambiguous — 'can fish' genuinely has two readings)"
);

section("8. Full chain on one sentence: TOKEN -> MORPHOLOGY -> POS, with context narrowing where it legitimately applies");
const posResults = tagSentence(sentence.tokens);
sentence.tokens.forEach((token, i) => {
  const result = posResults[i];
  console.log(`"${token.text}" -> POS=`, result.candidates.map((c) => c.tag), result.reason ? `(${result.reason})` : "");
});
console.log(
  "\nNote: 'cat' comes back with no POS candidate. It follows 'fastest' (ADJ), not a determiner directly, so\n" +
    "the single-previous-token context rule correctly does not reach back through the adjective to find 'the'.\n" +
    "That is an honest UNKNOWN, not a wrong guess — resolving it needs NP-chunking, which is Syntax-realm work."
);
