"use strict";

/**
 * Trinity Universe — Bootstrap Registration v0.1
 *
 * Populates the Capability/Realm/Portal/CommandCenter registries. This
 * is the ONE file in the Universe layer that makes a truth claim about
 * how many realms are real — and it is deliberately honest about being
 * small, not 100.
 *
 * === Why not 100 realms yet ===
 * Phase 13 of the spec says to build the 100-realm registry "based on
 * the existing Trinity AI Superpower Map." A repository-wide search
 * (grep across every file, every directory) found no such document —
 * no capability taxonomy, no realm-name list, nothing. Inventing 80-90
 * specific realm names/descriptions from nothing to hit a round number
 * would be exactly the "hallucinated capabilities" / "fake
 * implementation status" Phases 13/29 explicitly forbid, and deciding
 * the actual business taxonomy (Biology? Legal? Finance? Chemistry?
 * Astronomy?) is a product decision, not an engineering one this
 * session can make unilaterally.
 *
 * What this file DOES do:
 *   - Registers every realm this codebase has REAL, tested, benchmarked
 *     intelligence for for (7), each with a real `execute` function
 *     wired to the actual existing engine — status IMPLEMENTED, not a
 *     hopeful label.
 *   - Registers a small set of PLANNED placeholder realms using ONLY
 *     domain names the user themselves already named across this
 *     session's prompts (Physics, Coding, Multimodal, Research,
 *     Customer Intelligence, Biology) — proving the PLANNED/SCAFFOLDED
 *     pattern works, not pretending they're built.
 *   - Groups both into two Command Centers, proving that abstraction
 *     scales to more without redesign — adding realm #8 through #100
 *     is a data-entry problem against this same registry, not an
 *     architecture problem.
 *
 * The registry itself imposes no ceiling — see registry.js, which is a
 * plain Map. Scaling from 8 to 100 requires no code change here, only
 * more calls to registerRealm/registerPortal with real (or honestly
 * PLANNED) definitions.
 */

const { createCapability, createRealm, createPortal, createCommandCenter, createBotApplication } = require("./domain");
const { capabilityRegistry, realmRegistry, portalRegistry, commandCenterRegistry, botApplicationRegistry } = require("./registry");
const { RealmStatus, PortalStatus } = require("../shared/constants");

const math = require("../math/engine");
const { tokenize } = require("../language/realm/tokenRealm");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");
const reasoningRealm = require("../language/realm/reasoningRealm");
const verificationRealm = require("../language/realm/verificationRealm");
const policyEngine = require("../policy/engine");
const hypothesisRealm = require("../language/realm/hypothesisRealm");
const probabilityRealm = require("../language/realm/probabilityRealm");

const MATH_OPERATIONS = new Set([
  "add", "subtract", "multiply", "divide", "power", "sqrt",
  "solveLinearEquation", "solveQuadratic", "solveLinearInequality",
  "vectorAdd", "vectorSubtract", "dotProduct", "scale", "magnitude", "normalize",
  "matrixAdd", "matrixMultiply", "transpose", "identity", "determinant",
  "matrixVectorMultiply", "solveLinearSystem",
  "mean", "variance", "standardDeviation", "median",
  "bayesRule", "conditionalProbability", "expectedValue",
]);

function registerRealmAndPortal(realmDef, portalDef) {
  const realm = createRealm(realmDef);
  realmRegistry.register(realm);
  const portal = createPortal({ ...portalDef, realmId: realm.id });
  portalRegistry.register(portal);
  return { realm, portal };
}

// Idempotent: multiple entry points (benchmark.js, the demo, a future
// API route) may each need the registries populated, and the
// underlying registries are process-wide singletons (registry.js) —
// calling bootstrap() twice must never throw "already registered."
// Tests that need a genuinely clean registry use registry.js's own
// _reset() functions first (see universeBootstrap.test.js).
function bootstrap() {
  if (realmRegistry.has("realm.mathematics")) return;

  // -------------------------------------------------------------
  // Capabilities (Phase 4) — one per IMPLEMENTED realm, minimum
  // -------------------------------------------------------------
  const capabilities = [
    createCapability({ id: "cap.exact_computation", name: "Exact Computation", domain: "mathematics", operators: [...MATH_OPERATIONS] }),
    createCapability({ id: "cap.language_understanding", name: "Deterministic Language Understanding", domain: "language" }),
    createCapability({ id: "cap.deductive_reasoning", name: "Deductive Reasoning & Consistency Checking", domain: "reasoning" }),
    createCapability({ id: "cap.independent_verification", name: "Independent Claim Verification", domain: "verification" }),
    createCapability({ id: "cap.policy_evaluation", name: "Policy / Business Rule Evaluation", domain: "policy" }),
    createCapability({ id: "cap.hypothesis_formation", name: "Competing Hypothesis Formation", domain: "reasoning" }),
    createCapability({ id: "cap.probability_assignment", name: "Justified Probability Assignment", domain: "probability" }),
  ];
  for (const c of capabilities) capabilityRegistry.register(c);

  // -------------------------------------------------------------
  // IMPLEMENTED realms — real execute functions, real capabilities
  // -------------------------------------------------------------

  registerRealmAndPortal(
    {
      id: "realm.mathematics",
      name: "Mathematics",
      description: "Exact arithmetic through gradient descent (math/engine.js).",
      category: "STEM",
      capabilities: ["cap.exact_computation"],
      status: RealmStatus.VERIFIED,
      benchmarks: ["arithmetic_2_plus_2", "arithmetic_12_times_17", "quadratic_equation", "vector_dot_product", "matrix_determinant", "bayes_probability", "gradient_descent_convergence"],
      execute: ({ operation, args }) => {
        if (!MATH_OPERATIONS.has(operation)) {
          throw new TypeError(`Unsupported mathematics operation '${operation}'.`);
        }
        const r = math[operation](...args);
        return { result: r.valid ? r.output : null, evidence: [r] };
      },
    },
    { id: "portal.mathematics", name: "Mathematics Portal", status: PortalStatus.ACTIVE }
  );

  registerRealmAndPortal(
    {
      id: "realm.language",
      name: "Language Understanding",
      description: "Symbol -> Token -> Morphology -> POS -> Syntax -> Entity -> Relationship -> Semantic -> Knowledge.",
      category: "LANGUAGE",
      capabilities: ["cap.language_understanding"],
      status: RealmStatus.VERIFIED,
      benchmarks: ["dog_bites_man_directionality", "works_at_vs_works_with", "copula_sentence_parsing", "telescope_ambiguity", "negation_real_chain"],
      execute: ({ text }) => {
        const { tokens } = tokenize(text);
        const r = extractKnowledge(text, tokens);
        return { result: r.records, evidence: r.records.map((rec) => rec.evidence), reason: r.reason };
      },
    },
    { id: "portal.language", name: "Language Understanding Portal", status: PortalStatus.ACTIVE }
  );

  registerRealmAndPortal(
    {
      id: "realm.reasoning",
      name: "Reasoning",
      description: "Rule application (deduction) and structural contradiction detection (reasoningRealm.js).",
      category: "COGNITION",
      capabilities: ["cap.deductive_reasoning"],
      status: RealmStatus.IMPLEMENTED,
      execute: ({ mode, ...args }) => {
        if (mode === "applyRule") return { result: reasoningRealm.applyRule(args.rule, args.records) };
        if (mode === "checkConsistency") return { result: reasoningRealm.checkConsistency(args.records, { constraints: args.constraints || [] }) };
        throw new TypeError(`Unsupported reasoning mode '${mode}' (expected 'applyRule' or 'checkConsistency').`);
      },
    },
    { id: "portal.reasoning", name: "Reasoning Portal", status: PortalStatus.ACTIVE }
  );

  registerRealmAndPortal(
    {
      id: "realm.verification",
      name: "Verification",
      description: "CLAIM -> EVIDENCE -> INDEPENDENT CHECK -> RESULT (verificationRealm.js).",
      category: "EPISTEMIC",
      capabilities: ["cap.independent_verification"],
      status: RealmStatus.IMPLEMENTED,
      execute: ({ claim, options }) => {
        const r = verificationRealm.verifyClaim(claim, options);
        return { result: r.outcome, verification: r, evidence: r.check_results || [] };
      },
    },
    { id: "portal.verification", name: "Verification Portal", status: PortalStatus.ACTIVE }
  );

  registerRealmAndPortal(
    {
      id: "realm.policy",
      name: "Policy & Business Rules",
      description: "Deterministic eligibility/decision evaluation over caller-supplied policies and facts (policy/engine.js).",
      category: "CUSTOMER_INTELLIGENCE",
      capabilities: ["cap.policy_evaluation"],
      status: RealmStatus.VERIFIED,
      benchmarks: ["policy_eligible_when_all_facts_known", "policy_unknown_never_guessed", "policy_exception_overrides_conditions"],
      execute: ({ policy, facts, now }) => {
        const r = policyEngine.evaluatePolicy(policy, facts, { now });
        return { result: r.status, evidence: [r] };
      },
    },
    { id: "portal.policy", name: "Policy Portal", status: PortalStatus.ACTIVE }
  );

  registerRealmAndPortal(
    {
      id: "realm.hypothesis",
      name: "Hypothesis Formation",
      description: "Competing explanations with mechanically-computed status, never a forced single winner (hypothesisRealm.js).",
      category: "COGNITION",
      capabilities: ["cap.hypothesis_formation"],
      status: RealmStatus.IMPLEMENTED,
      execute: (args) => ({ result: hypothesisRealm.proposeHypothesis(args) }),
    },
    { id: "portal.hypothesis", name: "Hypothesis Portal", status: PortalStatus.ACTIVE }
  );

  registerRealmAndPortal(
    {
      id: "realm.probability",
      name: "Probability & Uncertainty",
      description: "The sole gate where probability may leave NOT_DEFINED, requiring a real math/engine.js-provenance result (probabilityRealm.js).",
      category: "EPISTEMIC",
      capabilities: ["cap.probability_assignment"],
      status: RealmStatus.IMPLEMENTED,
      execute: ({ record, mathResult }) => ({ result: probabilityRealm.assignProbability(record, mathResult) }),
    },
    { id: "portal.probability", name: "Probability Portal", status: PortalStatus.ACTIVE }
  );

  // -------------------------------------------------------------
  // PLANNED placeholder realms — domain names the user already named
  // in this session's own prompts. Contract + portal only; no
  // execute function; portalInvoke.js reports NOT_IMPLEMENTED
  // honestly for every one of these. NOT a claim that these are the
  // "correct" next 93 realms — see module doc.
  // -------------------------------------------------------------
  const plannedRealms = [
    { id: "realm.physics", name: "Physics", category: "STEM" },
    { id: "realm.coding", name: "Coding", category: "ENGINEERING" },
    { id: "realm.multimodal", name: "Multimodal", category: "LANGUAGE" },
    { id: "realm.research", name: "Research", category: "COGNITION" },
    { id: "realm.customer", name: "Customer Intelligence", category: "CUSTOMER_INTELLIGENCE" },
    { id: "realm.biology", name: "Biology", category: "STEM" },
  ];
  for (const def of plannedRealms) {
    registerRealmAndPortal(
      { id: def.id, name: def.name, category: def.category, status: RealmStatus.PLANNED },
      { id: `portal.${def.id.split(".")[1]}`, name: `${def.name} Portal`, status: PortalStatus.PLANNED }
    );
  }

  // -------------------------------------------------------------
  // Command Centers (Phase 11/12) — a first, honest grouping. The
  // spec's target of 10 is a data-population task against this same
  // model, not an architectural one; two are populated here to prove
  // the pattern generalizes without redesign.
  // -------------------------------------------------------------
  commandCenterRegistry.register(
    createCommandCenter({
      id: "cc.intelligence_core",
      name: "Intelligence Core Command Center",
      description: "The Trinity engine's own deterministic reasoning/knowledge/epistemic realms.",
      realmIds: ["realm.mathematics", "realm.language", "realm.reasoning", "realm.verification", "realm.hypothesis", "realm.probability"],
      portalIds: ["portal.mathematics", "portal.language", "portal.reasoning", "portal.verification", "portal.hypothesis", "portal.probability"],
    })
  );
  commandCenterRegistry.register(
    createCommandCenter({
      id: "cc.customer_intelligence",
      name: "Customer Intelligence Command Center",
      description: "Policy/business-rule reasoning and its planned neighbors.",
      realmIds: ["realm.policy", "realm.customer"],
      portalIds: ["portal.policy", "portal.customer"],
    })
  );
  commandCenterRegistry.register(
    createCommandCenter({
      id: "cc.frontier",
      name: "Frontier Command Center",
      description: "PLANNED realms not yet built — grouped so their eventual implementation has a home without further redesign.",
      realmIds: ["realm.physics", "realm.coding", "realm.multimodal", "realm.research", "realm.biology"],
      portalIds: ["portal.physics", "portal.coding", "portal.multimodal", "portal.research", "portal.biology"],
    })
  );

  // -------------------------------------------------------------
  // Bot Applications (Phase 15) — a bot is a user-facing manifestation
  // of one or more portals, not forced into one-bot-one-realm. These
  // two are real: every portal id they list is a registered, ACTIVE
  // portal backed by real intelligence (no fabricated composition).
  // -------------------------------------------------------------
  botApplicationRegistry.register(
    createBotApplication({
      id: "bot.general_intelligence",
      name: "General Intelligence Bot",
      description: "A composition of every IMPLEMENTED/VERIFIED realm's portal — the Intelligence Core Command Center as one bot.",
      primaryRealm: "realm.language",
      portals: ["portal.language", "portal.mathematics", "portal.reasoning", "portal.verification", "portal.hypothesis", "portal.probability"],
      capabilities: capabilities.map((c) => c.id).filter((id) => id !== "cap.policy_evaluation"),
      benchmarkProfile: "intelligence_core",
    })
  );
  botApplicationRegistry.register(
    createBotApplication({
      id: "bot.customer_support",
      name: "Customer Support Bot",
      description: "A single-portal bot — proves a BotApplication need not span multiple realms.",
      primaryRealm: "realm.policy",
      portals: ["portal.policy"],
      capabilities: ["cap.policy_evaluation"],
      benchmarkProfile: "customer_intelligence",
    })
  );
}

module.exports = { bootstrap };
