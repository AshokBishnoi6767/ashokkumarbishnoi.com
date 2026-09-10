"use strict";

/**
 * Trinity — Model Router v0.1 (M13)
 *
 * NOT the same thing as model/registry.js, which routes among LLM CHAT
 * PROVIDERS (Anthropic/OpenAI/Gemini/null) for a single conversational
 * turn. This router routes among COMPUTATIONAL MECHANISMS for a
 * declared TASK TYPE — deterministic math, deterministic reasoning,
 * deterministic entity extraction, deterministic language generation,
 * or (only for the one task type nothing deterministic in this
 * codebase can do) an LLM provider, reached through model/registry.js
 * rather than duplicating its provider-selection logic.
 *
 * === This router does not classify intent from raw text ===
 * "select the appropriate computational mechanism based on task"
 * presumes the task is already known. Nothing built in this codebase
 * turns "what is 2+2" into TaskType.ARITHMETIC — that would be an NLU
 * intent-classification capability this build never constructed, and
 * inventing one here (a task-type guesser) would be exactly the kind
 * of fabricated capability the master spec forbids elsewhere. The
 * caller (a human, or a future intent-classification realm) declares
 * `taskType` explicitly; this router's job is only "given a known task
 * type, which mechanism handles it, and how do I actually call it" —
 * still real routing + real execution, just not task detection.
 *
 * === The router does not default to an LLM ===
 * Every TaskType below except OPEN_ENDED_GENERATION resolves to a
 * deterministic backend already built in this codebase. An unknown
 * taskType throws rather than silently falling through to the LLM
 * path — "prefer deterministic computation where sufficient" is
 * enforced by there being no default case that reaches for one.
 */

const math = require("../math/engine");
const reasoningRealm = require("../language/realm/reasoningRealm");
const entityRealm = require("../language/realm/entityRealm");
const knowledgeQueryRealm = require("../language/realm/knowledgeQueryRealm");
const generationRealm = require("../language/realm/generationRealm");
const hypothesisRealm = require("../language/realm/hypothesisRealm");
const verificationRealm = require("../language/realm/verificationRealm");
const modelRegistry = require("./registry");

const TaskType = Object.freeze({
  ARITHMETIC: "ARITHMETIC",
  DEDUCTIVE_REASONING: "DEDUCTIVE_REASONING",
  CONSISTENCY_CHECK: "CONSISTENCY_CHECK",
  ENTITY_EXTRACTION: "ENTITY_EXTRACTION",
  KNOWLEDGE_QUERY: "KNOWLEDGE_QUERY",
  SURFACE_TEXT_GENERATION: "SURFACE_TEXT_GENERATION",
  // Added Phase 4: Reasoning was routable from the start (M13); Hypothesis
  // and Verification — the other two Intelligence Core realms (M3/M4) —
  // were not. Same thin-dispatch pattern as every other deterministic
  // case below, closing that completeness gap rather than leaving two of
  // the four Intelligence Core realms unreachable through the router.
  HYPOTHESIS_PROPOSAL: "HYPOTHESIS_PROPOSAL",
  CLAIM_VERIFICATION: "CLAIM_VERIFICATION",
  OPEN_ENDED_GENERATION: "OPEN_ENDED_GENERATION",
});

// Arithmetic/algebra/vectors/matrices/statistics/probability/
// optimization all live behind one TaskType here (ARITHMETIC is used
// loosely for "any math/engine.js operation") because they already
// share one uniform, safe call contract — a whitelisted operation name
// plus positional params, never an arbitrary method invocation.
const MATH_OPERATIONS = new Set(Object.keys(math));

function routeArithmetic({ operation, params = [] }) {
  if (!MATH_OPERATIONS.has(operation)) {
    throw new TypeError(`Unknown math operation "${operation}". Must be one of: ${[...MATH_OPERATIONS].join(", ")}`);
  }
  return math[operation](...params);
}

async function routeTask({ taskType, args = {} }) {
  switch (taskType) {
    case TaskType.ARITHMETIC:
      return { backend: "MATHEMATICAL_ENGINE", result: routeArithmetic(args) };

    case TaskType.DEDUCTIVE_REASONING:
      return { backend: "REASONING_REALM", result: reasoningRealm.applyRule(args.rule, args.records) };

    case TaskType.CONSISTENCY_CHECK:
      return { backend: "REASONING_REALM", result: reasoningRealm.checkConsistency(args.records, args.options) };

    case TaskType.ENTITY_EXTRACTION:
      return { backend: "ENTITY_REALM", result: entityRealm.extractEntityMentions(args.text, args.tokens, args.options) };

    case TaskType.KNOWLEDGE_QUERY:
      return { backend: "KNOWLEDGE_QUERY_REALM", result: knowledgeQueryRealm.queryKnowledge(args.records, args.criteria) };

    case TaskType.SURFACE_TEXT_GENERATION:
      return { backend: "LANGUAGE_GENERATION_REALM", result: generationRealm.generateSurfaceText(args.record) };

    case TaskType.HYPOTHESIS_PROPOSAL:
      return { backend: "HYPOTHESIS_REALM", result: hypothesisRealm.proposeHypothesis(args) };

    case TaskType.CLAIM_VERIFICATION:
      return { backend: "VERIFICATION_REALM", result: verificationRealm.verifyClaim(args.claim, args.options) };

    // The one task type with no deterministic mechanism in this
    // codebase. Reached through model/registry.js's own
    // pickConnected()/safeInvoke() — not duplicated here — so "no
    // provider connected" already resolves to the same honest UNKNOWN
    // result registry.js's own tests already cover, rather than a
    // network call or a crash.
    case TaskType.OPEN_ENDED_GENERATION: {
      const { provider, reason } = modelRegistry.pickConnected();
      if (!provider) return { backend: "LLM_PROVIDER", result: { status: "UNKNOWN", output: null, reason } };
      const result = await modelRegistry.safeInvoke(provider, args.request);
      return { backend: "LLM_PROVIDER", result };
    }

    default:
      throw new TypeError(`Unknown or unsupported taskType: ${taskType}. The router never guesses a backend for an unrecognized task.`);
  }
}

module.exports = { TaskType, routeTask };
