"use strict";

/**
 * Trinity Universe — Orchestration Engine v0.1
 *
 * executePlan() runs an explicit OrchestrationPlan (protocol.js) —
 * every step and dependency edge is data the caller supplied and can
 * inspect, never hidden inside one opaque function call (Phase 9's
 * explicit requirement). Independent steps (all dependencies already
 * completed) run in parallel via Promise.all; a step whose
 * dependencies never complete (a cycle, or a dependency naming a
 * nonexistent step) is reported as ERROR rather than silently skipped
 * or left to hang forever.
 *
 * This module does NOT decide what capabilities a task needs or which
 * realms to pick — "understand task -> identify required capabilities
 * -> identify candidate realms/portals" (Phase 10) is deliberately left
 * to a caller (a future Meta-Intelligence layer, Phase 27) that
 * constructs the OrchestrationPlan; this module only EXECUTES a plan
 * that already exists, exactly the same "plan vs. execute" separation
 * portalInvoke.js already enforces at the single-portal level.
 */

const { createPortalRequest, createRealmExecution, PortalResultStatus } = require("./protocol");
const { invokePortal } = require("./portalInvoke");
const { portalRegistry } = require("./registry");

async function runStep(plan, step, { authorization, context }) {
  const portal = portalRegistry.get(step.portalId);
  const realmId = portal ? portal.realmId : "unresolved";
  const request = createPortalRequest({ portalId: step.portalId, request: step.payload, context, authorization });
  const result = await invokePortal(request);
  return createRealmExecution({
    planId: plan.id,
    stepId: step.stepId,
    portalId: step.portalId,
    realmId,
    status: result.status,
    input: step.payload,
    portalResult: result,
  });
}

async function executePlan(plan, { authorization, context = null } = {}) {
  const stepById = new Map(plan.steps.map((s) => [s.stepId, s]));
  const completed = new Map();
  const pending = new Set(plan.steps.map((s) => s.stepId));

  while (pending.size > 0) {
    const ready = [...pending].map((id) => stepById.get(id)).filter((s) => s.dependsOn.every((dep) => completed.has(dep)));

    if (ready.length === 0) {
      // Every remaining step has an unmet dependency (a cycle, or a
      // dependency naming a step that isn't in this plan at all) —
      // reported explicitly, never silently dropped.
      for (const stepId of pending) {
        const step = stepById.get(stepId);
        completed.set(
          stepId,
          createRealmExecution({
            planId: plan.id,
            stepId,
            portalId: step.portalId,
            realmId: "unresolved",
            status: PortalResultStatus.ERROR,
            input: step.payload,
            portalResult: null,
          })
        );
      }
      break;
    }

    const results = await Promise.all(ready.map((step) => runStep(plan, step, { authorization, context })));
    for (const execution of results) completed.set(execution.stepId, execution);
    for (const step of ready) pending.delete(step.stepId);
  }

  const executions = plan.steps.map((s) => completed.get(s.stepId));
  return { plan, executions };
}

module.exports = { executePlan };
