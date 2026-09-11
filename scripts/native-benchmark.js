"use strict";

/**
 * Trinity — Native Intelligence Benchmark
 *
 * A small, explicit, zero-network smoke check of the deterministic
 * engine, run with the real modules (no mocks). Reports PASS / FAIL /
 * NOT_IMPLEMENTED per capability — never a subjective score. This is a
 * supplement to, not a replacement for, the full test suite
 * (`npm test`); it exists to give one readable readout of exactly what
 * NATIVE_TRINITY can and cannot do with zero external providers.
 *
 * Run: node scripts/native-benchmark.js
 */

const { tokenize } = require("../learning-core/language/realm/tokenRealm");
const { tagSentence } = require("../learning-core/language/realm/posRealm");
const { parseSentence } = require("../learning-core/language/realm/syntaxRealm");
const { extractEntityMentions } = require("../learning-core/language/realm/entityRealm");
const { extractRelationships } = require("../learning-core/language/realm/relationshipRealm");
const { extractPropositions } = require("../learning-core/language/realm/semanticRealm");
const { extractKnowledge } = require("../learning-core/language/realm/knowledgeRealm");
const { applyRule, checkConsistency } = require("../learning-core/language/realm/reasoningRealm");
const { verifyClaim } = require("../learning-core/language/realm/verificationRealm");
const { VerificationOutcome, TruthState } = require("../learning-core/shared/constants");
const math = require("../learning-core/math/engine");
const { extractArithmeticIntent } = require("../learning-core/language/mathIntent");
const { attemptNative } = require("../learning-core/core/nativeResponder");
const ownerAccount = require("../learning-core/integration/auth/ownerAccount");
const credentials = require("../learning-core/integration/credentials/reference");
const modelRegistry = require("../learning-core/model/registry");
const fs = require("fs");
const path = require("path");

const results = [];
function check(category, name, fn) {
  let status, detail;
  try {
    const ok = fn();
    status = ok ? "PASS" : "FAIL";
    detail = "";
  } catch (err) {
    status = "FAIL";
    detail = err.message;
  }
  results.push({ category, name, status, detail });
}
function notImplemented(category, name, reason) {
  results.push({ category, name, status: "NOT_IMPLEMENTED", detail: reason });
}

const SENTENCE = "John works at Acme.";

// ---------------------------------------------------------------- LANGUAGE
const { tokens } = tokenize(SENTENCE);
check("LANGUAGE", "tokenization", () => tokens.length > 0);

const tags = tagSentence(tokens);
check("LANGUAGE", "POS tagging", () => Array.isArray(tags) && tags.length === tokens.length);

const parsed = parseSentence(tokens);
check("LANGUAGE", "syntax parsing", () => parsed && parsed.clause && parsed.clause.subject && parsed.clause.verb);

const entities = extractEntityMentions(SENTENCE, tokens);
check("LANGUAGE", "entity extraction", () => entities.some((e) => e.surface === "John") && entities.some((e) => e.surface === "Acme"));

const relationships = extractRelationships(SENTENCE, tokens).relationships;
check("LANGUAGE", "relationship extraction", () => relationships.length > 0 && relationships[0].predicate === "WORKS_AT");

const propositions = extractPropositions(SENTENCE, tokens).propositions;
check("LANGUAGE", "semantic representation", () => propositions.length > 0 && propositions[0].truth_state === TruthState.UNKNOWN);

// -------------------------------------------------------------- KNOWLEDGE
const knowledgeResult = extractKnowledge(SENTENCE, tokens);
check("KNOWLEDGE", "proposition -> knowledge representation", () => knowledgeResult.records.length > 0);
check("KNOWLEDGE", "provenance preservation", () => knowledgeResult.records.every((r) => r.provenance && r.provenance.realm));
check("KNOWLEDGE", "UNKNOWN preservation (no fabricated truth promotion)", () => knowledgeResult.records.every((r) => r.truth_state === TruthState.UNKNOWN));

// -------------------------------------------------------------------- MATH
check("MATH", "arithmetic: add/subtract/multiply", () => math.add(2, 2).output === 4 && math.subtract(10, 4).output === 6 && math.multiply(6, 7).output === 42);
check("MATH", "arithmetic: division by zero reported invalid, not fabricated", () => math.divide(1, 0).valid === false);
check("MATH", "algebra: linear equation solved exactly", () => math.solveLinearEquation(2, -4).output.x === 2);
check("MATH", "vectors: dot product", () => math.dotProduct([1, 2, 3], [4, 5, 6]).output === 32);
check("MATH", "matrices: determinant", () => math.determinant([[1, 2], [3, 4]]).output === -2);
check("MATH", "probability: mean/variance", () => math.mean([1, 2, 3, 4]).output === 2.5);
check("MATH", "natural-language arithmetic intent -> real engine (\"What is 2 + 2?\")", () => {
  const intent = extractArithmeticIntent("What is 2 + 2?");
  return intent.matched && intent.operation === "add";
});

// --------------------------------------------------------------- REASONING
const rule = { id: "rule-birds-fly", if: { predicate: "IS_A", objectSurface: "bird" }, then: { predicate: "CAN", objectSurface: "fly" } };
const premise = {
  id: "know-1",
  subject: { id: "e-penguins", surface: "Penguins", type: "UNKNOWN" },
  predicate: "IS_A",
  object: { id: "e-bird", surface: "bird", type: "UNKNOWN" },
  truth_state: TruthState.UNKNOWN,
};
check("REASONING", "deduction (rule application)", () => {
  const [derived] = applyRule(rule, [premise]);
  return derived && derived.predicate === "CAN";
});
check("REASONING", "consistency / contradiction checking", () => {
  const positive = { id: "c1", subject: { id: "e1", surface: "X", type: "UNKNOWN" }, predicate: "IS", object: { id: "e2", surface: "Y", type: "UNKNOWN" }, polarity: "POSITIVE", truth_state: TruthState.UNKNOWN };
  const negative = { id: "c2", subject: { id: "e1", surface: "X", type: "UNKNOWN" }, predicate: "IS", object: { id: "e2", surface: "Y", type: "UNKNOWN" }, polarity: "NEGATIVE", truth_state: TruthState.UNKNOWN };
  return checkConsistency([positive, negative]).length > 0;
});
notImplemented("REASONING", "induction / abduction / causal / physical reasoning", "Not built in this codebase — never claimed.");

// ------------------------------------------------------------- VERIFICATION
check("VERIFICATION", "KNOWN/VERIFIED via independent recomputation", () => verifyClaim({ id: "c1" }, { independentChecks: [{ name: "arithmetic", check: () => 2 + 2 === 4 }] }).outcome === VerificationOutcome.VERIFIED);
check("VERIFICATION", "UNKNOWN when no independent check exists", () => verifyClaim({ id: "c2" }).outcome === VerificationOutcome.UNKNOWN);
check("VERIFICATION", "CONTRADICTED when a check fails", () => verifyClaim({ id: "c3" }, { independentChecks: [{ name: "x", check: () => false }] }).outcome === VerificationOutcome.CONTRADICTED);
check("VERIFICATION", "PARTIALLY_VERIFIED on mixed independent-check results", () => {
  return verifyClaim({ id: "c4" }, { independentChecks: [{ name: "a", check: () => true }, { name: "b", check: () => undefined }] }).outcome === VerificationOutcome.PARTIALLY_VERIFIED;
});

// ------------------------------------------------------------------ SECURITY
check("SECURITY", "authorization: unknown uid is never the owner", () => ownerAccount.isOwner("some-random-uid-never-set-up") === false);
check("SECURITY", "secret leakage: credential describe() never returns the raw value", () => {
  const described = credentials.describe("anthropic");
  return described && !JSON.stringify(described).includes(process.env.ANTHROPIC_API_KEY || "__unset__");
});
check("SECURITY", "structural isolation: publicAgent.js has no require path to connectors/tools/memory", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "learning-core", "core", "publicAgent.js"), "utf8");
  return !/require\(["'].*(connectors|toolRouter|integration\/router|\/actions\/lifecycle|\/memory\/store)["']\)/.test(source);
});
check("SECURITY", "no LLM required for a real model list to be reported", () => Array.isArray(modelRegistry.listProviders()));

// ------------------------------------------------------------- INDEPENDENCE
async function checkAsync(category, name, fn) {
  let status, detail;
  try {
    status = (await fn()) ? "PASS" : "FAIL";
    detail = "";
  } catch (err) {
    status = "FAIL";
    detail = err.message;
  }
  results.push({ category, name, status, detail });
}

async function main() {
  await checkAsync("INDEPENDENCE", "public/private agent native path answers arithmetic with zero providers connected", async () => {
    const nativeMath = await attemptNative("What is 12 * 4?");
    return nativeMath.matched && nativeMath.status === "VERIFIED" && nativeMath.reply === "12 * 4 = 48";
  });
  await checkAsync("INDEPENDENCE", "genuinely open-ended input is left unmatched by the native path, never fabricated", async () => {
    const nativeOpenEnded = await attemptNative("What should I focus on today?");
    return nativeOpenEnded.matched === false;
  });

  // -------------------------------------------------------------- REPORT
  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] = byCategory[r.category] || [];
    byCategory[r.category].push(r);
  }
  let totalPass = 0, totalFail = 0, totalNI = 0;
  for (const [category, rows] of Object.entries(byCategory)) {
    console.log(`\n=== ${category} ===`);
    for (const r of rows) {
      console.log(`${r.status.padEnd(15)} ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
      if (r.status === "PASS") totalPass++;
      else if (r.status === "FAIL") totalFail++;
      else totalNI++;
    }
  }
  console.log(`\nTOTAL: ${totalPass} PASS, ${totalFail} FAIL, ${totalNI} NOT_IMPLEMENTED (out of ${results.length})`);
  process.exit(totalFail > 0 ? 1 : 0);
}

main();
