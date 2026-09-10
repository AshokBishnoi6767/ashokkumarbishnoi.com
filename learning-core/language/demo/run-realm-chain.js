"use strict";

/**
 * Deterministic demonstration of the realm chain built so far:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX
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
const { findNounPhrases, parseSentence } = require("../realm/syntaxRealm");

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

section("9. Syntax Realm: NP chunking resolves exactly the gap POS left open — 'cat' becomes the chunk head through structure, not a POS context hack");
const catChunks = findNounPhrases(tokenize("The fastest cat runs.").tokens);
for (const chunk of catChunks) {
  console.log(
    `"${chunk.tokens.map((t) => t.text).join(" ")}" -> det="${chunk.det.text}", modifiers=[${chunk.modifiers
      .map((t) => t.text)
      .join(", ")}], head="${chunk.head.text}" (headInferredFromPosition=${chunk.headInferredFromPosition})`
  );
}

section("10. Syntax Realm: word order determines SUBJECT/OBJECT — 'Dog bites man.' vs 'Man bites dog.'");
for (const sentence of ["Dog bites man.", "Man bites dog."]) {
  const { tokens } = tokenize(sentence);
  const parsed = parseSentence(tokens);
  const c = parsed.clause;
  console.log(
    `"${sentence}" -> SUBJECT="${c.subject.head.text}", VERB="${c.verb.token.text}", OBJECT="${c.object.head.text}"`
  );
}
console.log("Same three words, swapped roles — the relationship is genuinely different, not just relabeled.");

section("11. Syntax Realm: 'The fastest cat runs.' — subject NP resolved through syntax, no object forced (intransitive)");
{
  const { tokens } = tokenize("The fastest cat runs.");
  const parsed = parseSentence(tokens);
  const c = parsed.clause;
  console.log(
    `SUBJECT="${c.subject.tokens.map((t) => t.text).join(" ")}" (head="${c.subject.head.text}"), VERB="${c.verb.token.text}", OBJECT=${c.object}`
  );
}

section("12. Syntax Realm: ambiguity and missing evidence are reported honestly, never forced");
{
  const noVerb = parseSentence(tokenize("The big red ball.").tokens);
  console.log("'The big red ball.' -> clause.state =", noVerb.clause.state, "| reason:", noVerb.clause.reason);

  const ambiguousVerb = parseSentence(tokenize("Dogs cats chase.").tokens);
  console.log(
    "'Dogs cats chase.' -> clause.state =",
    ambiguousVerb.clause.state,
    "| ambiguous =",
    ambiguousVerb.clause.ambiguous,
    "| verbCandidates =",
    ambiguousVerb.clause.verbCandidates.map((t) => t.text),
    "| reason:",
    ambiguousVerb.clause.reason
  );
}
