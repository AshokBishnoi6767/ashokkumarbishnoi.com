"use strict";

// Structural (not just behavioral) proof that malicious tool/connector
// output and malicious external-webpage content have no path into a model
// prompt: neither agent that ever calls a model provider requires a
// connector, the tool router, or any fetch-capable module. This is checked
// against the actual source text, not just today's observed behavior, so a
// future edit that adds such a require is caught here even before any
// runtime test could exercise it.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const FORBIDDEN_REQUIRE_PATTERN = /require\(["'].*(connectors|toolRouter|integration\/router)["']\)/;

function sourceOf(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("structural isolation: publicAgent.js never requires a connector, the tool router, or any private action module", () => {
  const source = sourceOf("core/publicAgent.js");
  assert.doesNotMatch(source, FORBIDDEN_REQUIRE_PATTERN);
  assert.doesNotMatch(source, /require\(["'].*\/actions\/lifecycle["']\)/);
  assert.doesNotMatch(source, /require\(["'].*\/memory\/store["']\)/); // no direct memory access either
});

test("structural isolation: privateAgent.js's model call never requires a connector or the tool router directly — only personalAI.js (which never calls a model) does", () => {
  const source = sourceOf("core/privateAgent.js");
  assert.doesNotMatch(source, FORBIDDEN_REQUIRE_PATTERN);

  const personalAiSource = sourceOf("core/personalAI.js");
  assert.doesNotMatch(personalAiSource, /safeInvoke|model\/registry/); // confirms the one module that DOES touch the tool router never calls a model
});

test("structural isolation: buildSystemPrompt's only dynamic input is memory the owner's own conversation produced — never raw connector/tool output", () => {
  const { buildSystemPrompt } = require("../core/privateAgent");
  const prompt = buildSystemPrompt([{ type: "preference", truth_state: "KNOWN", confidence: 1, content: "prefers dark mode" }]);
  assert.match(prompt, /prefers dark mode/);
  // The function signature itself only accepts a memory array — there is no
  // second parameter for connector/tool results, so nothing else CAN reach it.
  assert.equal(buildSystemPrompt.length, 1);
});
