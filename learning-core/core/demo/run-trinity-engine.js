"use strict";

/**
 * Deterministic demonstration of the Full Engine Orchestration (M14):
 * every realm from Symbol through the Model Router, composed into one
 * callable pipeline, with zero LLM/network dependency by default.
 *
 * Run with: node learning-core/core/demo/run-trinity-engine.js
 *
 * Not a test (see ../../test/trinityEngine.test.js for the assertions
 * this demo's claims are backed by) — a readable trace for manual
 * inspection.
 */

const { understand, reason, runTrinityPipeline } = require("../trinityEngine");

function section(title) {
  console.log("\n=== " + title + " ===");
}

async function main() {
  section("1. understand(): one call composes tokens, entities, knowledge, and context from raw text");
  const u = understand("John works at Google.");
  console.log(`Entities: ${u.entities.map((e) => e.surface).join(", ")}`);
  console.log(`Knowledge: ${u.knowledge.records.map((r) => `${r.subject.surface} ${r.predicate} ${r.object.surface}`).join("; ")}`);
  console.log(`Context known_state: [${u.context.known_state.join(", ")}]`);

  section("2. reason(): derives new facts only from caller-supplied rules — no rule, no derivation");
  const noRuleResult = reason(u, {});
  console.log(`reason(u, {}) -> ${noRuleResult.derived.length} derived records (nothing invented)`);
  const rule = { id: "rule-badge", if: { predicate: "WORKS_AT", objectSurface: "Google" }, then: { predicate: "HAS_BADGE_ACCESS", objectSurface: "Google campus" } };
  const withRule = reason(u, { rules: [rule] });
  console.log(`reason(u, {rules:[badge rule]}) -> ${withRule.derived[0].subject.surface} ${withRule.derived[0].predicate} ${withRule.derived[0].object.surface} (${withRule.derived[0].truth_state})`);

  section("3. runTrinityPipeline(): full chain end to end, including generation back to surface text");
  const result = await runTrinityPipeline("Dog bites man.");
  console.log(`Input: "Dog bites man." -> generated: "${result.generated[0].text}"`);

  section("4. runTrinityPipeline() with a rule: both the observed fact and its derivation get rendered back to text");
  const withReasoning = await runTrinityPipeline("John works at Google.", { rules: [rule] });
  withReasoning.generated.forEach((g) => console.log(`  - ${g.text}`));

  section("5. Honest 'nothing found' input never throws — it surfaces as an empty, explained result");
  const nothing = await runTrinityPipeline("The big red ball.");
  console.log(`records: ${nothing.understanding.knowledge.records.length}, reason: "${nothing.understanding.knowledge.reason}"`);

  section("6. Zero LLM/network dependency by default — this entire demo made no external calls");
  console.log("Confirmed by construction: understand()/reason() never require model/registry.js; only generate()'s Model Router path could, and this demo only used SURFACE_TEXT_GENERATION.");
}

main();
