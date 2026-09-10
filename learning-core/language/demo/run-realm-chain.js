"use strict";

/**
 * Deterministic demonstration of the realm chain built so far:
 *
 *   SYMBOL -> LEXICAL -> TOKEN -> MORPHOLOGY -> POS -> SYNTAX -> ENTITY
 *   -> RELATIONSHIP -> SEMANTIC REPRESENTATION -> KNOWLEDGE REPRESENTATION
 *   -> KNOWLEDGE QUERY -> CONTEXT REPRESENTATION
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
const { extractEntityMentions, groupMentionsByCandidateIdentity } = require("../realm/entityRealm");
const { extractRelationships } = require("../realm/relationshipRealm");
const { extractPropositions } = require("../realm/semanticRealm");
const { extractKnowledge } = require("../realm/knowledgeRealm");
const { queryKnowledge, indexKnowledgeBySubject } = require("../realm/knowledgeQueryRealm");
const { buildContextFrame, detectUnresolvedReferences } = require("../realm/contextRealm");
const { applyRule, applyRulesUntilFixedPoint, checkConsistency } = require("../realm/reasoningRealm");
const { proposeHypothesis, addEvidence, groupHypothesesByProposition } = require("../realm/hypothesisRealm");
const { verifyClaim, checkProvenance } = require("../realm/verificationRealm");
const math = require("../../math/engine");
const { assignProbability, resolveUncertainty, representDistribution } = require("../realm/probabilityRealm");
const { storeKnowledgeAsMemory, storeVerificationAsMemory } = require("../../memory/realmBridge");
const memoryStore = require("../../memory/store");
const learningPipeline = require("../../learning/candidatePipeline");
const feedbackLoop = require("../../learning/feedbackLoop");

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

function showEntities(text, opts) {
  const { tokens } = tokenize(text);
  const mentions = extractEntityMentions(text, tokens, opts);
  console.log(`"${text}"`);
  if (mentions.length === 0) {
    console.log("  (no entity mentions — ordinary common nouns are not treated as named entities)");
  }
  for (const m of mentions) {
    console.log(`  "${m.surface}" -> ${m.type} [${m.source}] span=[${m.span.tokenStart},${m.span.tokenEnd})`, m.attributes);
  }
}

section("13. Entity Realm: ordinary common nouns are NOT entities, even when capitalized by sentence position");
showEntities("Dog bites man.");

section("14. Entity Realm: PERSON/ORGANIZATION/LOCATION recognized structurally, with spans that track sentence position, not a fixed template");
showEntities("John works at Google in Toronto.");
showEntities("Google works with John in Toronto.");
console.log("Same three entities, different sentence positions — spans below correctly move with the word order.");

section("15. Entity Realm: multi-token entities — a location seed phrase and a structural organization suffix");
showEntities("New York is big.");
showEntities("Acme Corp hired John."); // "Acme" is not in any seed list — recognized via the "Corp" suffix alone

section("16. Entity Realm: NUMBER and TIME, reusing the existing temporal/ subsystem rather than reimplementing it");
showEntities("The team has 42 members.");
showEntities("The event is at 3 PM.");
showEntities("The call is at 13 PM."); // shape recognized, value unresolvable -> UNKNOWN, never guessed
showEntities("The trip is tomorrow.", { now: new Date("2026-09-10T12:00:00Z"), timezone: "UTC" });

section("17. Entity Realm: mention vs. identity — repeated mentions are never silently merged into one real-world entity");
{
  const text = "John met John.";
  const { tokens } = tokenize(text);
  const mentions = extractEntityMentions(text, tokens);
  console.log(`"${text}" -> ${mentions.length} separate mentions:`, mentions.map((m) => m.id));
  const groups = groupMentionsByCandidateIdentity(mentions);
  console.log(
    "groupMentionsByCandidateIdentity ->",
    groups.map((g) => `${g.normalized}/${g.type} (${g.mentionIds.length} mentions)`)
  );
  console.log(
    "This is surface-form clustering ONLY, not a claim these are the same real person —\n" +
      "that would require coreference/relationship evidence this phase deliberately does not add."
  );
}

function showRelationships(text, opts) {
  const { tokens } = tokenize(text);
  const result = extractRelationships(text, tokens, opts);
  console.log(`"${text}"`);
  if (result.relationships.length === 0) {
    console.log(`  (no relationship) reason: ${result.reason}${result.ambiguous ? " [ambiguous]" : ""}`);
  }
  for (const rel of result.relationships) {
    console.log(
      `  ${rel.subject.surface} --${rel.predicate}--> ${rel.object.surface}` +
        `  (subject=${rel.subject.type}, object=${rel.object.type}, verb="${rel.attributes.verb}", prep=${rel.attributes.preposition})`
    );
  }
}

section("18. Relationship Realm: word order determines subject/object, exactly as it did at the Syntax layer");
showRelationships("Dog bites man.");
showRelationships("Man bites dog.");
console.log("Same predicate, swapped roles — a genuinely different relationship, not a relabeling.");

section("19. Relationship Realm: verb + preposition folds into a compound predicate; direction still matters");
showRelationships("John works at Google.");
showRelationships("Google works with John.");

section("20. Relationship Realm: one clause, two relationships — the object span is chunked into repeated [PREP, entity] pairs sharing one subject/verb");
showRelationships("John works at Google in Toronto.");

section("21. Relationship Realm: never manufactured — no verb, ambiguous verb, or an unresolvable multi-token object");
showRelationships("John and Google.");
showRelationships("Dogs cats chase.");
showRelationships("Boy throws red ball.");
showRelationships("The fastest cat runs.");

function showPropositions(text, opts) {
  const { tokens } = tokenize(text);
  const result = extractPropositions(text, tokens, opts);
  console.log(`"${text}"`);
  if (result.propositions.length === 0) {
    console.log(`  (no proposition) reason: ${result.reason}${result.ambiguous ? " [ambiguous]" : ""}`);
  }
  for (const prop of result.propositions) {
    console.log(
      `  ${prop.subject.surface} --${prop.predicate}--> ${prop.object.surface}` +
        `  | truth_state=${prop.truth_state} confidence=${prop.confidence} probability=${prop.probability} uncertainty=${prop.uncertainty}` +
        `  | evidence.relationship_id=${prop.evidence.relationship_id} evidence.text="${prop.evidence.text}"`
    );
  }
}

section("22. Semantic Realm: a Relationship becomes an explicit Proposition — epistemic fields are honest, never invented");
showPropositions("Dog bites man.");
showPropositions("Man bites dog.");
console.log("Same predicate, swapped roles — genuinely different propositions, exactly as at the Relationship layer.");

section("23. Semantic Realm: direction still matters through the full chain");
showPropositions("John works at Google.");
showPropositions("Google works with John.");

section("24. Semantic Realm: one clause, two propositions — boundaries preserved, never collapsed into one vague meaning");
showPropositions("John works at Google in Toronto.");

section("25. Semantic Realm: extraction from text is NOT verification — truth_state stays UNKNOWN, probability stays NOT_DEFINED, uncertainty stays PRESENT, confidence stays null (the existing architectural default), even though extraction itself was fully deterministic");
showPropositions("John works at Google.");

section("26. Semantic Realm: never manufactured — same honest failures as the Relationship Realm propagate up unchanged");
showPropositions("John and Google.");
showPropositions("The fastest cat runs.");
showPropositions("The big red ball.");
showPropositions("John met John."); // "met" is not a recognized verb pivot in this architecture — zero propositions, not a fabricated MET relation

section("27. Semantic Realm: mention identity preserved even with identical surface forms");
showPropositions("John chased John.");

section("28. Semantic Realm: temporal information already resolved below is carried forward, never reinterpreted");
showPropositions("John works at Google today.", { now: new Date("2026-09-10T12:00:00Z"), timezone: "UTC" });
console.log("Known limitation: negation is not representable at this boundary — see semanticRealm.js module doc.");

function showKnowledge(text, opts) {
  const { tokens } = tokenize(text);
  const result = extractKnowledge(text, tokens, opts);
  console.log(`"${text}"`);
  if (result.records.length === 0) {
    console.log(`  (no knowledge record) reason: ${result.reason}${result.ambiguous ? " [ambiguous]" : ""}`);
  }
  for (const record of result.records) {
    console.log(
      `  ${record.subject.surface} --${record.predicate}--> ${record.object.surface}` +
        `  | truth_state=${record.truth_state} confidence=${record.confidence} probability=${record.probability} uncertainty=${record.uncertainty}` +
        `  | proposition_id=${record.proposition_id} evidence.relationship_id=${record.evidence.relationship_id}` +
        `  | provenance.realm=${record.provenance.realm} provenance.proposition_source=${record.provenance.proposition_source}`
    );
  }
}

section("29. Knowledge Realm: a Proposition becomes an explicit, individually-addressable Knowledge Record — KNOWLEDGE != TRUTH");
showKnowledge("Dog bites man.");
showKnowledge("Man bites dog.");
console.log("Same predicate, swapped roles — genuinely different knowledge records, exactly as at every layer below.");

section("30. Knowledge Realm: direction still matters through the full chain");
showKnowledge("John works at Google.");
showKnowledge("Google works with John.");

section("31. Knowledge Realm: one clause, two knowledge records — never collapsed");
showKnowledge("John works at Google in Toronto.");

section("32. Knowledge Realm: contradictory or duplicate propositions coexist as separate records — no merging, no resolution");
{
  const { buildKnowledgeRecords } = require("../realm/knowledgeRealm");
  const { extractPropositions: extractProps } = require("../realm/semanticRealm");
  function propsFor(text) {
    const { tokens } = tokenize(text);
    return extractProps(text, tokens).propositions;
  }
  const dup1 = propsFor("Dog bites man.")[0];
  const dup2 = propsFor("Dog bites man.")[0];
  const [recA, recB] = buildKnowledgeRecords([dup1, dup2]);
  console.log(
    `Two extractions of "Dog bites man." -> two distinct KnowledgeRecord ids: ${recA.id} !== ${recB.id}` +
      ` (same predicate/subject/object, never silently merged into one)`
  );
}

section("33. Knowledge Realm: never manufactured — honest upstream failures propagate to zero knowledge records");
showKnowledge("John and Google.");
showKnowledge("The fastest cat runs.");
showKnowledge("The big red ball.");

section("34. Knowledge Query Realm: exact structural filtering — no ranking, no merging, no reasoning");
{
  const text = "John works at Google in Toronto.";
  const { tokens } = tokenize(text);
  const records = extractKnowledge(text, tokens).records;

  console.log(`"${text}" -> ${records.length} knowledge records`);

  const byPredicate = queryKnowledge(records, { predicate: "WORKS_IN" });
  console.log(
    `queryKnowledge({predicate: "WORKS_IN"}) ->`,
    byPredicate.map((r) => `${r.subject.surface} --${r.predicate}--> ${r.object.surface}`)
  );

  const johnId = records[0].subject.id;
  const bySubjectId = queryKnowledge(records, { subjectId: johnId });
  console.log(
    `queryKnowledge({subjectId: "${johnId}"}) -> ${bySubjectId.length} records (both WORKS_AT and WORKS_IN share one subject identity)`
  );

  const combined = queryKnowledge(records, { subjectSurface: "john", predicate: "WORKS_AT" });
  console.log(
    `queryKnowledge({subjectSurface: "john", predicate: "WORKS_AT"}) -> ${combined.length} record` +
      (combined.length ? `: ${combined[0].subject.surface} --${combined[0].predicate}--> ${combined[0].object.surface}` : "")
  );
}

section("35. Knowledge Query Realm: identity vs. surface-form — 'John chased John.' distinguishes subject mention from object mention");
{
  const text = "John chased John.";
  const { tokens } = tokenize(text);
  const [record] = extractKnowledge(text, tokens).records;
  console.log(
    `subjectId=${record.subject.id} objectId=${record.object.id} (same surface "John", different identity)`
  );
  console.log(
    `queryKnowledge({subjectId: subject's id}) -> ${queryKnowledge([record], { subjectId: record.subject.id }).length} match`,
    `| queryKnowledge({subjectId: object's id}) -> ${queryKnowledge([record], { subjectId: record.object.id }).length} match (the object mention was never a subject)`
  );
}

section("36. Knowledge Query Realm: contradictory/duplicate records both come back from a matching query, never merged");
{
  const text = "Dog bites man.";
  const { tokens } = tokenize(text);
  const dup1 = extractKnowledge(text, tokens).records[0];
  const dup2 = extractKnowledge(text, tokens).records[0];
  const results = queryKnowledge([dup1, dup2], { predicate: "BITES" });
  console.log(
    `Two separate extractions of "Dog bites man." -> queryKnowledge({predicate: "BITES"}) returns ${results.length} records:`,
    results.map((r) => r.id)
  );
}

section("37. Knowledge Query Realm: indexing groups without merging");
{
  const text = "John works at Google in Toronto.";
  const { tokens } = tokenize(text);
  const records = extractKnowledge(text, tokens).records;
  const index = indexKnowledgeBySubject(records);
  for (const [subjectId, recs] of index.entries()) {
    console.log(`subject ${subjectId} -> ${recs.length} record(s):`, recs.map((r) => r.predicate));
  }
}

section("38. Context Realm: known vs. unknown is explicit — nothing is guessed for an unsupplied field");
{
  const empty = buildContextFrame();
  console.log("buildContextFrame() with nothing supplied ->");
  console.log("  known_state:", empty.known_state);
  console.log("  unknown_state:", empty.unknown_state);
}

section("39. Context Realm: assembling a real snapshot from entities/propositions/knowledge already produced downstream");
{
  const text = "John works at Google in Toronto.";
  const { tokens } = tokenize(text);
  const entities = extractEntityMentions(text, tokens);
  const records = extractKnowledge(text, tokens).records;

  const frame = buildContextFrame({
    sessionId: "sess-demo-1",
    currentInput: { text },
    speaker: { id: "user-1", name: "Ashok" },
    activeEntities: entities,
    activePropositions: records,
    activeKnowledge: records,
    tokens,
  });

  console.log(`"${text}" ->`);
  console.log(`  known_state: [${frame.known_state.join(", ")}]`);
  console.log(`  active_entities: ${frame.active_entities.length}, active_propositions/knowledge: ${frame.active_propositions.length}`);
  console.log(
    `  each active_propositions[i].truth_state is still "${frame.active_propositions[0].truth_state}"` +
      ` — the Context Realm added no epistemic fields of its own`
  );
}

section("40. Context Realm: an unresolved reference is flagged, never silently resolved");
{
  const text = "John called him.";
  const { tokens } = tokenize(text);
  const refs = detectUnresolvedReferences(tokens);
  console.log(`"${text}" -> unresolved_references:`, refs.map((r) => `"${r.surface}" (${r.status}, candidates: ${r.candidate_tags.join("/")})`));
  console.log(`  No "referent" field exists on any entry — resolving identity is explicitly out of scope here.`);
}

section("41. Reasoning Realm: deduction — 'All birds fly. Penguins are birds.' derives 'Penguins can fly.', marked DERIVED not KNOWN");
{
  const penguin = { id: "entity-penguins", surface: "Penguins", type: "UNKNOWN" };
  const premise = { id: "know-penguin-bird", subject: penguin, predicate: "IS_A", object: { surface: "bird" }, truth_state: "UNKNOWN" };
  const rule = { id: "rule-birds-fly", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };
  const [derived] = applyRule(rule, [premise]);
  console.log(`Premise: Penguins IS_A bird. Rule: IS_A bird -> CAN fly (caller-supplied, not built in).`);
  console.log(`Derived: ${derived.subject.surface} ${derived.predicate} ${derived.object.surface} | truth_state=${derived.truth_state} | derived_from=${JSON.stringify(derived.derived_from)}`);
}

section("42. Reasoning Realm: multi-hop derivation chain, each hop's provenance traceable back to its own rule");
{
  const penguin = { id: "entity-penguins", surface: "Penguins", type: "UNKNOWN" };
  const premise = { id: "know-penguin-bird", subject: penguin, predicate: "IS_A", object: { surface: "bird" }, truth_state: "UNKNOWN" };
  const flyRule = { id: "rule-1", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };
  const airborneRule = { id: "rule-2", if: { predicate: "CAN", objectSurface: "fly" }, then: { predicate: "IS", objectSurface: "airborne-capable" } };
  const chain = applyRulesUntilFixedPoint([flyRule, airborneRule], [premise]);
  chain.forEach((d) => console.log(`  hop: ${d.subject.surface} ${d.predicate} ${d.object.surface} (rule ${d.derived_from[1]})`));
}

section("43. Reasoning Realm: contradiction detection — 'John is in Toronto.' / 'John is not in Toronto.' coexist, neither deleted");
{
  const john = { id: "entity-john", surface: "John", type: "PERSON" };
  const toronto = { id: "entity-toronto", surface: "Toronto", type: "LOCATION" };
  const positive = { id: "know-a", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE", truth_state: "UNKNOWN" };
  const negative = { id: "know-b", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE", truth_state: "UNKNOWN" };
  const contradictions = checkConsistency([positive, negative]);
  console.log(`checkConsistency([positive, negative]) ->`, contradictions.map((c) => `${c.type}: ${c.status} over [${c.conflicting_records.join(", ")}]`));
  console.log(`  Both records still exist afterward, truth_state unchanged: ${positive.truth_state}, ${negative.truth_state} — resolution deferred to Verification.`);
}

section('44. Hypothesis Realm: "I saw the man with the telescope." — two competing readings coexist, neither forced to win');
{
  const text = "I saw the man with the telescope.";
  const { tokens } = tokenize(text);
  const [proposition] = extractPropositions(text, tokens).propositions;

  let hUsedTelescope = proposeHypothesis({
    proposition: proposition || { id: "prop-telescope-demo" },
    supportingEvidence: ["PP-attachment reading A: 'with the telescope' modifies the verb 'saw'"],
  });
  let hManHadTelescope = proposeHypothesis({
    proposition: proposition || { id: "prop-telescope-demo" },
    supportingEvidence: ["PP-attachment reading B: 'with the telescope' modifies 'the man'"],
  });

  console.log(`Hypothesis A: ${hUsedTelescope.status} (${hUsedTelescope.supporting_evidence.length} supporting)`);
  console.log(`Hypothesis B: ${hManHadTelescope.status} (${hManHadTelescope.supporting_evidence.length} supporting)`);
  console.log("Neither is deleted or auto-selected — both remain addressable, distinct hypotheses.");

  hManHadTelescope = addEvidence(hManHadTelescope, { contradicting: ["no telescope was mentioned as the man's possession elsewhere in context"] });
  console.log(`Hypothesis B after contradicting evidence -> status: ${hManHadTelescope.status} (still not deleted, not silently resolved)`);
}

section("45. Verification Realm: '2 + 2' — verified by actual recomputation, not by the engine having produced the claim");
{
  const claim = { id: "claim-arithmetic" };
  const verifiedGood = verifyClaim(claim, { independentChecks: [{ name: "arithmetic", check: () => 2 + 2 === 4 }] });
  const verifiedBad = verifyClaim(claim, { independentChecks: [{ name: "arithmetic", check: () => 2 + 2 === 5 }] });
  console.log(`"2 + 2 = 4" -> ${verifiedGood.outcome}`);
  console.log(`"2 + 2 = 5" -> ${verifiedBad.outcome}`);
}

section("46. Verification Realm: an unchecked claim is UNKNOWN, not silently trusted");
{
  const result = verifyClaim({ id: "claim-unchecked" });
  console.log(`verifyClaim({id: "claim-unchecked"}) with no evidence -> ${result.outcome} (${result.reason})`);
}

section("47. Verification Realm: a claim flagged by Reasoning's own contradiction detection is CONTRADICTED here too");
{
  const john = { id: "entity-john", surface: "John" };
  const toronto = { id: "entity-toronto", surface: "Toronto" };
  const claim = { id: "know-a", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "POSITIVE" };
  const opposite = { id: "know-b", subject: john, predicate: "LOCATED_IN", object: toronto, polarity: "NEGATIVE" };
  const result = verifyClaim(claim, { allRecords: [claim, opposite] });
  console.log(`verifyClaim(John LOCATED_IN Toronto, against a contradicting record) -> ${result.outcome}`);
}

section("48. Verification Realm: provenance checking is separate from truth — complete provenance is not itself VERIFIED");
{
  const text = "John works at Google.";
  const { tokens } = tokenize(text);
  const [record] = extractKnowledge(text, tokens).records;
  const provenanceCheck = checkProvenance(record);
  const verification = verifyClaim(record);
  console.log(`checkProvenance -> complete: ${provenanceCheck.complete}`);
  console.log(`verifyClaim (no independent check supplied) -> ${verification.outcome} — well-formed provenance alone never verifies a claim`);
}

section("49. Mathematical Engine: arithmetic, algebra, and the invalid cases that never get faked");
{
  console.log(`2 + 2 -> ${math.add(2, 2).output}`);
  console.log(`12 x 17 -> ${math.multiply(12, 17).output}`);
  console.log(`5 / 0 ->`, math.divide(5, 0));
  console.log(`x^2 - 5x + 6 = 0 ->`, math.solveQuadratic(1, -5, 6).output);
  console.log(`x^2 + 1 = 0 ->`, math.solveQuadratic(1, 0, 1).output, "(no fabricated complex roots)");
}

section("50. Mathematical Engine: vectors, matrices, a real linear system solve");
{
  console.log(`[1,2,3] . [4,5,6] -> ${math.dotProduct([1, 2, 3], [4, 5, 6]).output}`);
  console.log(`det([[6,1,1],[4,-2,5],[2,8,7]]) -> ${math.determinant([[6, 1, 1], [4, -2, 5], [2, 8, 7]]).output}`);
  const system = math.solveLinearSystem([[2, 1], [1, -1]], [5, 1]);
  console.log(`Solve 2x+y=5, x-y=1 -> x=${system.output[0]}, y=${system.output[1]}`);
}

section("51. Mathematical Engine: Bayes' rule — probability is only ever a real computation, never fabricated for prose");
{
  const r = math.bayesRule({ pBGivenA: 0.99, pA: 0.01, pB: 0.0198 });
  console.log(`P(disease|positive test) given P(pos|disease)=0.99, P(disease)=0.01, P(pos)=0.0198 -> ${r.output}`);
  console.log(`("John may be angry." never receives a number like 0.72 unless a model like this one actually computed it from real inputs.)`);
}

section("52. Mathematical Engine: gradient descent as an explicit operator — theta_(t+1) = theta_t - eta*grad(L(theta_t))");
{
  const r = math.runGradientDescent({ theta0: 0, gradientFn: (x) => 2 * (x - 3), learningRate: 0.1 });
  console.log(`Minimizing (x-3)^2 from theta0=0 -> converged=${r.output.converged} in ${r.output.iterations} iterations, theta≈${r.output.theta.toFixed(6)}`);
}

section("53. Probability/Uncertainty Realm: a KnowledgeRecord's probability only ever moves off NOT_DEFINED via a real computation");
{
  const text = "John works at Google.";
  const { tokens } = tokenize(text);
  const [record] = extractKnowledge(text, tokens).records;
  console.log(`Before: probability=${record.probability}, uncertainty=${record.uncertainty}`);

  const bayes = math.bayesRule({ pBGivenA: 0.9, pA: 0.2, pB: 0.3 });
  const withProbability = assignProbability(record, bayes);
  console.log(`After assignProbability(record, math.bayesRule(...)): probability=${withProbability.probability} (method: ${withProbability.probability_provenance.method})`);

  try {
    assignProbability(record, 0.72);
  } catch (err) {
    console.log(`assignProbability(record, 0.72) [a bare number] -> rejected: "${err.message}"`);
  }
}

section("54. Probability/Uncertainty Realm: uncertainty is cleared only by an actual VERIFIED outcome, never by confidence or probability");
{
  const record = { id: "know-x", uncertainty: "PRESENT" };
  const verified = verifyClaim({ id: "know-x" }, { independentChecks: [{ name: "check", check: () => true }] });
  const contradicted = verifyClaim({ id: "know-y" }, { independentChecks: [{ name: "check", check: () => false }] });
  console.log(`resolveUncertainty after VERIFIED -> ${resolveUncertainty(record, verified).uncertainty}`);
  console.log(`resolveUncertainty after CONTRADICTED -> ${resolveUncertainty(record, contradicted).uncertainty} (still PRESENT — contradicted is not the same as "no longer uncertain")`);
}

section("55. Probability/Uncertainty Realm: a distribution is validated, never auto-normalized");
{
  console.log("Fair coin {heads:0.5, tails:0.5} ->", representDistribution([{ label: "heads", probability: 0.5 }, { label: "tails", probability: 0.5 }]).valid);
  const bad = representDistribution([{ label: "a", probability: 0.3 }, { label: "b", probability: 0.3 }]);
  console.log(`{a:0.3, b:0.3} (sums to 0.6) -> valid=${bad.valid}, error="${bad.error}"`);
}

section("56. Memory Realm Integration: a KnowledgeRecord stored into the EXISTING memory/store.js Memory Engine, content preserved whole");
{
  const text = "John works at Google.";
  const { tokens } = tokenize(text);
  const [record] = extractKnowledge(text, tokens).records;
  const memory = storeKnowledgeAsMemory(record);
  console.log(`Stored as memory_id=${memory.memory_id}, class=SEMANTIC, truth_state=${memory.truth_state}, related_entities=${JSON.stringify(memory.related_entities)}`);
  const recalled = memoryStore.recall("SEMANTIC", memory.memory_id);
  console.log(`Recalled content matches the original KnowledgeRecord: ${JSON.stringify(recalled.content) === JSON.stringify(record)}`);

  const verification = verifyClaim(record, { independentChecks: [{ name: "manual-confirmation", check: () => true }] });
  const verificationMemory = storeVerificationAsMemory(verification);
  console.log(`Verification result stored as PROVENANCE memory, truth_state=${verificationMemory.truth_state}`);
}

section("57. Learning Engine: a candidate rule cannot reach PROMOTED without passing every gate in order");
{
  const rule = { id: "rule-demo", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };
  let candidate = learningPipeline.proposeCandidate({ kind: "REASONING_RULE", payload: rule, evidence: ["user stated this rule three times"] });
  console.log(`proposeCandidate -> ${candidate.status}`);
  candidate = learningPipeline.validateCandidate(candidate);
  console.log(`validateCandidate -> ${candidate.status}`);
  candidate = learningPipeline.regressionTest(candidate, []);
  console.log(`regressionTest (against an empty baseline) -> ${candidate.status}`);
  try {
    learningPipeline.promoteCandidate(candidate);
  } catch (err) {
    console.log(`promoteCandidate before acceptCandidate -> rejected: "${err.message}"`);
  }
  candidate = learningPipeline.acceptCandidate(candidate, { approvedBy: "ashok" });
  console.log(`acceptCandidate({approvedBy:"ashok"}) -> ${candidate.status}`);
  const { candidate: promoted, memoryRecord } = learningPipeline.promoteCandidate(candidate);
  console.log(`promoteCandidate -> ${promoted.status}, written to Memory Engine as memory_id=${memoryRecord.memory_id} (class LEARNED_PATTERN)`);
  console.log(`Full history: ${promoted.history.map((h) => h.status).join(" -> ")}`);
}

section("58. Feedback Engine: INPUT -> ESTIMATE -> OUTPUT -> FEEDBACK -> UPDATED STATE -> NEXT INPUT");
{
  let state = feedbackLoop.initialState();
  const cycle1 = feedbackLoop.recordFeedback({ input: "2+2", estimate: 4, output: math.add(2, 2).output, matched: true, currentState: state });
  state = cycle1.updated_state;
  console.log(`Cycle 1: estimate=4, output=${cycle1.output} -> ${cycle1.feedback}. State: confirmed=${state.confirmed_count}, mismatch=${state.mismatch_count}`);

  const cycle2 = feedbackLoop.recordFeedback({ input: "12*17", estimate: 200, output: math.multiply(12, 17).output, matched: false, currentState: state });
  state = cycle2.updated_state;
  console.log(`Cycle 2: estimate=200, output=${cycle2.output} -> ${cycle2.feedback}. State: confirmed=${state.confirmed_count}, mismatch=${state.mismatch_count}`);

  const candidate = feedbackLoop.feedbackToLearningCandidate(cycle2);
  console.log(`MISMATCH -> Learning Engine candidate event created (trigger: ${candidate.trigger}, promoted_to_persistent: ${candidate.promoted_to_persistent})`);

  const confirmedCandidate = feedbackLoop.feedbackToLearningCandidate(cycle1);
  console.log(`CONFIRMED -> no learning candidate needed: ${confirmedCandidate}`);
}
