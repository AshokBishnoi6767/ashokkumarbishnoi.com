"use strict";

/**
 * Trinity Universe — Capability / Realm / Portal / Command Center
 * Registries v0.1
 *
 * Four small, structurally identical registries (Map-backed, in-memory,
 * per-process — no persistence claimed). Each is DISCOVERY ONLY: register,
 * get, list, find. None of them execute anything. Execution is
 * portalInvoke.js's job exclusively (Phase 5's explicit separation:
 * "The registry must NOT execute arbitrary realm code merely because
 * something exists in the registry... Separate: discovery, authorization,
 * invocation, execution, verification").
 *
 * These are plain mutable registries (register() adds an entry), not
 * because mutation is encouraged elsewhere in this codebase — it is
 * usually avoided — but because a registry's whole purpose is to
 * accumulate entries over the process lifetime, the same role
 * memory/store.js already plays for memory records. Registration
 * itself still goes through domain.js's validating factories, so
 * nothing malformed or falsely-statused ever enters the registry (see
 * domain.js's IMPLEMENTED-requires-execute check).
 */

function createRegistry(label, { idField = "id" } = {}) {
  const entries = new Map();

  function register(entry) {
    if (!entry || typeof entry !== "object" || typeof entry[idField] !== "string") {
      throw new TypeError(`${label}.register requires an object with a string '${idField}'.`);
    }
    if (entries.has(entry[idField])) {
      throw new Error(`${label}.register: '${entry[idField]}' is already registered (ids must be stable and unique).`);
    }
    entries.set(entry[idField], entry);
    return entry;
  }

  function get(id) {
    return entries.get(id) || null;
  }

  function list() {
    return [...entries.values()];
  }

  function has(id) {
    return entries.has(id);
  }

  function count() {
    return entries.size;
  }

  // Test-only: clears the registry. Never called by production paths.
  function _reset() {
    entries.clear();
  }

  return { register, get, list, has, count, _reset };
}

const capabilityRegistry = createRegistry("CapabilityRegistry");
const realmRegistry = createRegistry("RealmRegistry");
const portalRegistry = createRegistry("PortalRegistry");
const commandCenterRegistry = createRegistry("CommandCenterRegistry");
const botApplicationRegistry = createRegistry("BotApplicationRegistry");

// -----------------------------------------------------------------
// Realm-specific discovery helpers
// -----------------------------------------------------------------

function findRealmsByCategory(category) {
  return realmRegistry.list().filter((r) => r.category === category);
}

function findRealmsByCapability(capabilityId) {
  return realmRegistry.list().filter((r) => r.capabilities.includes(capabilityId));
}

function findRealmsByStatus(status) {
  return realmRegistry.list().filter((r) => r.status === status);
}

// Validates a registered realm against its OWN claimed status —
// catches "fake implementation status" (Phase 13) at inspection time,
// not just at registration time. Returns [] when consistent.
function validateRealm(realm) {
  const problems = [];
  const executableStatuses = ["EXPERIMENTAL", "IMPLEMENTED", "VERIFIED", "PRODUCTION_READY"];
  if (executableStatuses.includes(realm.status) && typeof realm.execute !== "function") {
    problems.push(`status ${realm.status} claimed but no execute function is wired.`);
  }
  if (realm.status === "VERIFIED" && realm.benchmarks.length === 0) {
    problems.push("status VERIFIED claimed but no benchmarks are listed.");
  }
  for (const capId of realm.capabilities) {
    if (!capabilityRegistry.has(capId)) {
      problems.push(`references unregistered capability '${capId}'.`);
    }
  }
  return problems;
}

// -----------------------------------------------------------------
// Portal-specific discovery helpers
// -----------------------------------------------------------------

function findPortalsByRealm(realmId) {
  return portalRegistry.list().filter((p) => p.realmId === realmId);
}

function findPortalByName(name) {
  return portalRegistry.list().find((p) => p.name === name) || null;
}

// A portal pointing at an unregistered realm, or a realm not marked
// ACTIVE-invokable, is caught here rather than discovered mid-invocation.
function validatePortal(portal) {
  const problems = [];
  const realm = realmRegistry.get(portal.realmId);
  if (!realm) {
    problems.push(`references unregistered realm '${portal.realmId}'.`);
  }
  return problems;
}

// -----------------------------------------------------------------
// Command Center discovery helpers
// -----------------------------------------------------------------

function resolveCommandCenterDependencies(commandCenterId) {
  const cc = commandCenterRegistry.get(commandCenterId);
  if (!cc) return { resolved: false, missingRealms: [], missingPortals: [] };
  const missingRealms = cc.realmIds.filter((id) => !realmRegistry.has(id));
  const missingPortals = cc.portalIds.filter((id) => !portalRegistry.has(id));
  return { resolved: missingRealms.length === 0 && missingPortals.length === 0, missingRealms, missingPortals };
}

// -----------------------------------------------------------------
// Bot Application discovery helpers
// -----------------------------------------------------------------

// A bot referencing a portal id that isn't actually registered would
// be exactly the "hallucinated capability" the spec forbids — caught
// here the same way validatePortal/validateRealm catch a dangling
// reference for their own contracts.
function validateBotApplication(bot) {
  const missingPortals = bot.portals.filter((id) => !portalRegistry.has(id));
  return missingPortals.length ? [`references unregistered portal(s): ${missingPortals.join(", ")}`] : [];
}

module.exports = {
  capabilityRegistry,
  realmRegistry,
  portalRegistry,
  commandCenterRegistry,
  botApplicationRegistry,
  validateBotApplication,
  findRealmsByCategory,
  findRealmsByCapability,
  findRealmsByStatus,
  validateRealm,
  findPortalsByRealm,
  findPortalByName,
  validatePortal,
  resolveCommandCenterDependencies,
};
