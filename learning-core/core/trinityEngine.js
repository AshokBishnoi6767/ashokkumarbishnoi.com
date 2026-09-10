"use strict";

/**
 * Trinity — Full Engine Orchestration v0.1 (M14)
 *
 * Connects every realm built through M13 into one callable pipeline:
 *
 *   INPUT -> TOKEN -> ENTITY -> RELATIONSHIP -> SEMANTIC -> KNOWLEDGE
 *   -> CONTEXT -> [REASONING -> HYPOTHESIS -> VERIFICATION (optional)]
 *   -> GENERATION (via the Model Router)
 *
 * This file does NOT wire into the live product surfaces
 * (core/publicAgent.js / core/privateAgent.js), which today handle
 * every real conversational turn purely through an LLM
 * (model/registry.js) and deliberately import nothing else — see
 * publicAgent.js's own comment: "Deliberately does NOT import the Tool
 * Router, Action Lifecycle, connectors, or any private module." Making
 * this deterministic pipeline the actual understanding layer behind
 * real user-facing chat would change production conversational
 * behavior on every message the live app handles — exactly the kind
 * of change this build treats as a separate, explicit decision, not
 * something to fold into an orchestration milestone. What this
 * milestone proves is that the full chain composes correctly end to
 * end as its own standalone engine; wiring it into a live agent is
 * deliberately left for later, explicit authorization.
 *
 * === Still no hidden LLM dependency ===
 * understand() and reason() never call model/registry.js or the Model
 * Router. Only generate()'s OPEN_ENDED_GENERATION path (unused by
 * default) reaches for an LLM, exactly as M13 established. Running
 * runTrinityPipeline() on any input produces a complete structured
 * result with zero network calls and zero credential dependency.
 */

const { tokenize } = require("../language/realm/tokenRealm");
const { extractEntityMentions } = require("../language/realm/entityRealm");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");
const { buildContextFrame } = require("../language/realm/contextRealm");
const { applyRules, checkConsistency } = require("../language/realm/reasoningRealm");
const { TaskType, routeTask } = require("../model/taskRouter");

// SYMBOL -> ... -> KNOWLEDGE -> CONTEXT. Pure function: same text (and
// same `now`, if the caller pins one) produces a structurally
// equivalent ContextFrame every time — see contextRealm.js's own
// determinism guarantee, which this inherits unchanged.
function understand(text, { sessionId = null, speaker = null, precedingInputs = [] } = {}) {
  const { tokens } = tokenize(text);
  const entities = extractEntityMentions(text, tokens);
  const knowledgeResult = extractKnowledge(text, tokens);
  const context = buildContextFrame({
    sessionId,
    currentInput: { text },
    precedingInputs,
    speaker,
    activeEntities: entities,
    activePropositions: knowledgeResult.records,
    activeKnowledge: knowledgeResult.records,
    tokens,
  });

  return { text, tokens, entities, knowledge: knowledgeResult, context };
}

// REASONING (+ optional CONSISTENCY_CHECK). `rules` and
// `regressionBaseline`/`constraints` are entirely caller-supplied —
// this orchestrator invents no world-knowledge rule and no
// contradiction constraint of its own, same discipline as
// reasoningRealm.js itself.
function reason(understanding, { rules = [], constraints = [] } = {}) {
  const baseRecords = understanding.knowledge.records;
  const derived = applyRules(rules, baseRecords);
  const contradictions = checkConsistency([...baseRecords, ...derived], { constraints });
  return { derived, contradictions };
}

// GENERATION, routed through the Model Router (M13) rather than
// calling generationRealm.js directly — so generation is subject to
// the same "deterministic first, LLM only for what nothing
// deterministic can do" routing as every other task.
async function generate(record) {
  return routeTask({ taskType: TaskType.SURFACE_TEXT_GENERATION, args: { record } });
}

// The full, standalone pipeline: understand -> reason (if rules were
// given) -> generate a surface rendering of every resulting record.
// Always returns a complete, structured result; never throws for
// honest "nothing found" cases (e.g. zero knowledge records) — those
// surface as empty arrays with their own upstream `reason` fields
// intact, not as a pipeline failure.
async function runTrinityPipeline(text, options = {}) {
  const understanding = understand(text, options);
  const reasoning = options.rules || options.constraints ? reason(understanding, options) : { derived: [], contradictions: [] };

  const allRecords = [...understanding.knowledge.records, ...reasoning.derived];
  const generated = [];
  for (const record of allRecords) {
    const { result } = await generate(record);
    generated.push(result);
  }

  return { understanding, reasoning, generated };
}

module.exports = { understand, reason, generate, runTrinityPipeline };
