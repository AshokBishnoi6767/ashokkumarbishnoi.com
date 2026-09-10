"use strict";

/**
 * Trinity Universe — Domain Model v0.1
 *
 * ARCHITECTURALLY SUPPORTED, not IMPLEMENTED-for-100-realms: this file
 * defines the deterministic, explicit contracts the rest of the Universe
 * layer (registries, portal invocation, orchestration) is built on. It
 * contains no domain knowledge itself and executes nothing — every
 * factory here validates shape and returns a frozen plain object,
 * exactly like reasoningRealm.js's rule shape or policy/engine.js's
 * condition shape. This module has zero dependency on any specific
 * realm's intelligence, so registering realm #1 or realm #100 never
 * requires touching this file.
 *
 * === Realm status is a truth claim, not decoration ===
 * `status` (RealmStatus, shared/constants.js) says how much REAL, TESTED
 * intelligence backs a realm entry:
 *   PLANNED       — contract + metadata only, no execution path at all.
 *   SCAFFOLDED    — contract + portal registered and invocable, but
 *                   still no execute function; portalInvoke.js reports
 *                   NOT_IMPLEMENTED automatically for both PLANNED and
 *                   SCAFFOLDED realms rather than requiring every
 *                   not-yet-built realm to hand-write a stub that just
 *                   returns UNKNOWN.
 *   EXPERIMENTAL  — a real execution path exists, unbenchmarked or
 *                   known-incomplete.
 *   IMPLEMENTED   — a real execution path exists, has tests.
 *   VERIFIED      — has passing benchmark coverage in addition to tests.
 *   PRODUCTION_READY — reserved; nothing in this milestone claims it.
 * createRealm() never infers or upgrades this field — the caller states
 * it, and the Realm Registry's own validateRealm() can be used to catch
 * a status that contradicts what's actually wired up (see
 * realmRegistry.js).
 *
 * === Capability vs. Realm (Phase 4's "do not duplicate") ===
 * A Capability is independently addressable and MAY belong to more than
 * one realm (e.g. "exact_arithmetic" could be used by both a Mathematics
 * realm and an Engineering realm). Realms reference capability ids;
 * capabilities never reference realm ids back — this keeps the
 * dependency direction one-way and avoids a realm "owning" a capability
 * another realm legitimately also needs.
 *
 * === Do not overengineer (Phase 2's own instruction) ===
 * Every factory here is a flat object with explicit required fields and
 * sane, honest defaults for optional ones (empty arrays, null, never a
 * guessed value) — no class hierarchy, no inheritance, no hidden state.
 */

const { RealmStatus, PortalStatus } = require("../shared/constants");

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function requireEnum(value, enumObj, label) {
  if (!Object.values(enumObj).includes(value)) {
    throw new TypeError(`${label} must be one of ${Object.values(enumObj).join(", ")}; got ${JSON.stringify(value)}.`);
  }
  return value;
}

function makeProvenance(realm, extra = {}) {
  return { realm, created_at: new Date().toISOString(), ...extra };
}

// ---------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------

function createCapability({
  id,
  name,
  domain,
  description = null,
  operators = [],
  algorithms = [],
  models = [],
  tools = [],
  constraints = [],
  policies = [],
  verification = null,
  benchmarks = [],
} = {}) {
  requireString(id, "Capability.id");
  requireString(name, "Capability.name");
  requireString(domain, "Capability.domain");
  return Object.freeze({
    id,
    name,
    domain,
    description,
    operators: requireArray(operators, "Capability.operators"),
    algorithms: requireArray(algorithms, "Capability.algorithms"),
    models: requireArray(models, "Capability.models"),
    tools: requireArray(tools, "Capability.tools"),
    constraints: requireArray(constraints, "Capability.constraints"),
    policies: requireArray(policies, "Capability.policies"),
    verification,
    benchmarks: requireArray(benchmarks, "Capability.benchmarks"),
  });
}

// ---------------------------------------------------------------------
// Realm
// ---------------------------------------------------------------------

function createRealm({
  id,
  name,
  description = null,
  category = null,
  capabilities = [],
  ontology = null,
  knowledgeScope = null,
  algorithms = [],
  operators = [],
  models = [],
  tools = [],
  policies = [],
  memoryScope = null,
  reasoningStrategies = [],
  verificationStrategies = [],
  learningStrategies = [],
  benchmarks = [],
  inputSchema = null,
  outputSchema = null,
  status = RealmStatus.PLANNED,
  execute = null,
  metadata = {},
} = {}) {
  requireString(id, "Realm.id");
  requireString(name, "Realm.name");
  requireEnum(status, RealmStatus, "Realm.status");
  if (execute !== null && typeof execute !== "function") {
    throw new TypeError("Realm.execute must be a function or null.");
  }
  // A realm claiming EXPERIMENTAL/IMPLEMENTED/VERIFIED/PRODUCTION_READY
  // without a real execute function would be exactly the "fake
  // implementation status" Phase 13 forbids — caught here, not left to
  // be discovered later at invocation time. Only PLANNED/SCAFFOLDED are
  // exempt (see the module doc's status vocabulary above).
  const executableStatuses = [RealmStatus.EXPERIMENTAL, RealmStatus.IMPLEMENTED, RealmStatus.VERIFIED, RealmStatus.PRODUCTION_READY];
  if (executableStatuses.includes(status) && execute === null) {
    throw new TypeError(`Realm '${id}' claims status ${status} but has no execute function.`);
  }

  return Object.freeze({
    id,
    name,
    description,
    category,
    capabilities: requireArray(capabilities, "Realm.capabilities"),
    ontology,
    knowledgeScope,
    algorithms: requireArray(algorithms, "Realm.algorithms"),
    operators: requireArray(operators, "Realm.operators"),
    models: requireArray(models, "Realm.models"),
    tools: requireArray(tools, "Realm.tools"),
    policies: requireArray(policies, "Realm.policies"),
    memoryScope,
    reasoningStrategies: requireArray(reasoningStrategies, "Realm.reasoningStrategies"),
    verificationStrategies: requireArray(verificationStrategies, "Realm.verificationStrategies"),
    learningStrategies: requireArray(learningStrategies, "Realm.learningStrategies"),
    benchmarks: requireArray(benchmarks, "Realm.benchmarks"),
    inputSchema,
    outputSchema,
    status,
    execute,
    metadata,
  });
}

// ---------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------

function createPortal({
  id,
  name,
  realmId,
  description = null,
  invocationSchema = null,
  authorizationPolicy = null,
  routingPolicy = null,
  verificationPolicy = null,
  status = PortalStatus.PLANNED,
} = {}) {
  requireString(id, "Portal.id");
  requireString(name, "Portal.name");
  requireString(realmId, "Portal.realmId");
  requireEnum(status, PortalStatus, "Portal.status");
  return Object.freeze({
    id,
    name,
    realmId,
    description,
    invocationSchema,
    authorizationPolicy,
    routingPolicy,
    verificationPolicy,
    status,
  });
}

// ---------------------------------------------------------------------
// Command Center
// ---------------------------------------------------------------------

function createCommandCenter({
  id,
  name,
  description = null,
  realmIds = [],
  portalIds = [],
  orchestrationPolicy = null,
  authorizationPolicy = null,
  verificationPolicy = null,
} = {}) {
  requireString(id, "CommandCenter.id");
  requireString(name, "CommandCenter.name");
  return Object.freeze({
    id,
    name,
    description,
    realmIds: requireArray(realmIds, "CommandCenter.realmIds"),
    portalIds: requireArray(portalIds, "CommandCenter.portalIds"),
    orchestrationPolicy,
    authorizationPolicy,
    verificationPolicy,
  });
}

// ---------------------------------------------------------------------
// Bot Application
// ---------------------------------------------------------------------

function createBotApplication({
  id,
  name,
  description = null,
  primaryRealm = null,
  portals = [],
  capabilities = [],
  memoryPolicy = null,
  knowledgePolicy = null,
  tools = [],
  authorization = null,
  verification = null,
  personality = null,
  interface: interfaceSpec = null,
  benchmarkProfile = null,
} = {}) {
  requireString(id, "BotApplication.id");
  requireString(name, "BotApplication.name");
  return Object.freeze({
    id,
    name,
    description,
    primaryRealm,
    portals: requireArray(portals, "BotApplication.portals"),
    capabilities: requireArray(capabilities, "BotApplication.capabilities"),
    memoryPolicy,
    knowledgePolicy,
    tools: requireArray(tools, "BotApplication.tools"),
    authorization,
    verification,
    personality,
    interface: interfaceSpec,
    benchmarkProfile,
  });
}

module.exports = {
  makeProvenance,
  requireString,
  requireArray,
  requireEnum,
  createCapability,
  createRealm,
  createPortal,
  createCommandCenter,
  createBotApplication,
};
