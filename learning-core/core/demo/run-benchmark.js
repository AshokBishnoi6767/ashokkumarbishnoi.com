"use strict";

/**
 * Prints the Trinity Benchmark Engine's real, measured results.
 * Run with: node learning-core/core/demo/run-benchmark.js
 */

const { runBenchmark, checkReproducibility } = require("../benchmark");

const result = runBenchmark();

console.log("=== TRINITY BENCHMARK ===\n");
for (const r of result.results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(32)} [${r.category}]  ${r.latency_ms.toFixed(3)}ms`);
  if (!r.passed) console.log(`      ${r.description}`);
}

console.log("\n=== BY CATEGORY ===");
for (const [category, stats] of Object.entries(result.by_category)) {
  console.log(`${category}: ${stats.passed}/${stats.total}`);
}

console.log("\n=== SUMMARY ===");
console.log(`${result.summary.passed}/${result.summary.total} passed (${(result.summary.accuracy * 100).toFixed(1)}% accuracy)`);

const repro = checkReproducibility();
console.log(`Reproducible across two independent runs: ${repro.reproducible}`);

console.log("\nNote: this environment has no trained model and no connected LLM credential, so there is no honest learned/LLM baseline to compare against — see core/benchmark.js's own module doc for why that is reported as absent rather than fabricated.");
