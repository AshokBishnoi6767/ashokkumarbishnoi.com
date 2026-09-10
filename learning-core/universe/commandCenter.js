"use strict";

/**
 * Trinity Universe — Command Center Request Handling v0.1 (Phase 11)
 *
 * A Command Center receives a high-level request, decomposes it into
 * required capabilities (caller-supplied — see metaIntelligence.js's
 * own "no LLM magic" boundary), discovers portals STRICTLY WITHIN ITS
 * OWN registered scope (`commandCenter.portalIds`), executes what it
 * can, and reports the rest as an explicit escalation rather than
 * reaching into another Command Center's realms on its own authority —
 * "PORTAL -> COMMAND CENTER escalation" made concrete: when a required
 * capability has no ACTIVE portal inside this Command Center, or is
 * ambiguous even within it, that is reported as `escalation`, never
 * silently resolved by widening scope without the caller deciding to.
 *
 * This module does NOT replace the Trinity Core (per Phase 11's own
 * instruction) — it is a thin coordination layer over the same
 * registry/planning/execution primitives every other caller uses.
 */

const { commandCenterRegistry } = require("./registry");
const { planForTask } = require("./metaIntelligence");
const { executePlan } = require("./orchestrator");

async function handleCommandCenterRequest(commandCenterId, { task, requiredCapabilities, payloadFor = () => ({}), authorization }) {
  const commandCenter = commandCenterRegistry.get(commandCenterId);
  if (!commandCenter) {
    return {
      commandCenterId,
      status: "ERROR",
      reason: `No command center registered with id '${commandCenterId}'.`,
      plan: null,
      executions: [],
      escalation: null,
    };
  }

  const { plan, resolution, unresolvedCapabilities, ambiguousCapabilities } = planForTask({
    task,
    requiredCapabilities,
    payloadFor,
    portalIds: commandCenter.portalIds,
  });

  const executions = plan ? (await executePlan(plan, { authorization })).executions : [];

  const needsEscalation = unresolvedCapabilities.length > 0 || ambiguousCapabilities.length > 0;
  const escalation = needsEscalation
    ? {
        commandCenterId,
        task,
        reason:
          unresolvedCapabilities.length > 0
            ? "one or more required capabilities have no ACTIVE portal within this command center's own scope"
            : "one or more required capabilities are ambiguous even within this command center's own scope",
        unresolvedCapabilities,
        ambiguousCapabilities,
      }
    : null;

  return { commandCenterId, status: "HANDLED", task, plan, resolution, executions, escalation };
}

module.exports = { handleCommandCenterRequest };
