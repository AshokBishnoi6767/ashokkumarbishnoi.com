"use strict";

/**
 * Trinity Universe — Meta-Intelligence v0.1 (Phase 27)
 *
 * "The mechanism that turns 100 specialist intelligences into one
 * Universe." Its job, per the spec, stops at a deliberately narrow
 * boundary: given a task's ALREADY-IDENTIFIED required capabilities
 * (plain strings, e.g. "cap.exact_computation"), discover which
 * realms/portals can serve each one, and construct an explicit,
 * inspectable OrchestrationPlan — never execute anything itself
 * (orchestrator.js does that), never invent a capability a task didn't
 * actually name, never silently pick among multiple candidate portals.
 *
 * === "Do not implement this through uncontrolled LLM magic" (Phase 16) ===
 * This module never calls a model. Turning a natural-language request
 * ("design a spacecraft") into a `requiredCapabilities` list is
 * upstream work for the Language realm (already-built deterministic
 * text->structure extraction) or, eventually, an explicit capability-
 * classification realm — NOT this module's job. planForTask() accepts
 * only explicit capability ids as input, exactly the same "text ->
 * structure -> decision, never guessed" discipline every realm below
 * this one already follows.
 *
 * === Never guesses among ambiguous candidates ===
 * A capability served by zero ACTIVE portals is reported in
 * `unresolvedCapabilities` (never silently dropped, never fabricated a
 * step). A capability served by MORE than one ACTIVE portal is reported
 * in `ambiguousCapabilities` with every candidate portal id listed —
 * picking one without an explicit tie-break from the caller would be
 * exactly the kind of guess this architecture forbids everywhere else.
 * The returned `plan` (when not null) covers only the CLEANLY resolved
 * capabilities; a caller decides whether a partial plan is acceptable
 * or whether to resolve the gaps first (see commandCenter.js's
 * escalation handling for one such caller).
 */

const { findRealmsByCapability, findPortalsByRealm } = require("./registry");
const { createOrchestrationPlan } = require("./protocol");
const { PortalStatus } = require("../shared/constants");

// Discovery only — no execution, no authorization check (that is
// portalInvoke.js's job once a plan built from this actually runs).
function discoverForCapability(capabilityId, { portalIds = null } = {}) {
  const realms = findRealmsByCapability(capabilityId);
  let portals = realms.flatMap((r) => findPortalsByRealm(r.id).filter((p) => p.status === PortalStatus.ACTIVE));
  if (portalIds) {
    const allowed = new Set(portalIds);
    portals = portals.filter((p) => allowed.has(p.id));
  }
  return { capabilityId, realms, portals };
}

// requiredCapabilities: string[]. `payloadFor(capabilityId)` supplies
// each resolved step's request payload (defaults to {} — a caller who
// needs real arguments, e.g. { operation: "add", args: [2,2] } for
// Mathematics, must supply this). `portalIds`, when given, restricts
// discovery to that set — this is exactly how commandCenter.js scopes
// planning to one Command Center's own portals without reaching
// outside it.
function planForTask({ task, requiredCapabilities, payloadFor = () => ({}), portalIds = null }) {
  if (typeof task !== "string" || task.length === 0) {
    throw new TypeError("planForTask requires a non-empty task description.");
  }
  if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length === 0) {
    throw new TypeError("planForTask requires a non-empty requiredCapabilities array — this module never infers what a task needs.");
  }

  const steps = [];
  const unresolvedCapabilities = [];
  const ambiguousCapabilities = [];
  const resolution = [];

  requiredCapabilities.forEach((capabilityId, index) => {
    const { realms, portals } = discoverForCapability(capabilityId, { portalIds });
    if (portals.length === 0) {
      unresolvedCapabilities.push({ capabilityId, reason: realms.length === 0 ? "no realm registered for this capability" : "realm(s) found but no ACTIVE portal" });
      return;
    }
    if (portals.length > 1) {
      ambiguousCapabilities.push({ capabilityId, candidatePortalIds: portals.map((p) => p.id) });
      return;
    }
    const portal = portals[0];
    const stepId = `step-${index + 1}`;
    steps.push({ stepId, portalId: portal.id, payload: payloadFor(capabilityId) });
    resolution.push({ capabilityId, portalId: portal.id, realmId: portal.realmId });
  });

  const plan = steps.length > 0 ? createOrchestrationPlan({ task, requiredCapabilities, steps }) : null;

  return { plan, resolution, unresolvedCapabilities, ambiguousCapabilities };
}

module.exports = { discoverForCapability, planForTask };
