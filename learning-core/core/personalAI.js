"use strict";

// PERSONAL AI — the Intelligence Core wiring that the prior roadblock
// report flagged as missing (P0 #1): the first thing that actually calls
// language understanding, temporal resolution, and the context engine
// together, then hands off to the Tool Router / Action Lifecycle / Control
// Layer. It answers "what should happen"; it never decides "is it allowed"
// — that remains entirely the Control Layer's job (auth/authorization.js,
// called inside runAction via the Tool Router).
//
// Deliberately narrow: this recognizes exactly one request shape
// ("create <title> <day> at <time>"). It is not a general assistant.
const { understand } = require("../language/understanding");
const { extractCalendarCreateIntent } = require("../language/calendarIntent");
const { resolveTemporalExpression } = require("../temporal/resolve");
const { parseTimeOfDay } = require("../temporal/parseTimeOfDay");
const { assembleContext } = require("../context/engine");
const { route } = require("../integration/router/toolRouter");
const { createLearningEvent } = require("../learning/events");

async function handleIntent({ text, requestedBy, now = new Date(), timezone = null, confirmed = false, params: extraParams = {} }) {
  // UNDERSTAND
  const basicUnderstanding = understand(text);
  const calendarIntent = extractCalendarCreateIntent(text);

  if (!calendarIntent.matched) {
    return { stage: "UNDERSTAND", status: "UNRECOGNIZED_INTENT", reason: calendarIntent.reason, basicUnderstanding };
  }

  // TEMPORAL — time-of-day parsing doesn't need a timezone, so it can run
  // immediately. Day resolution ("tomorrow") DOES depend on the timezone
  // (near midnight, "tomorrow" can be a different date depending on the
  // zone) — so the timezone must be confirmed BEFORE the day is resolved
  // against it, not defaulted afterward.
  const timeResolution = parseTimeOfDay(calendarIntent.timeExpression);

  // CONTEXT — deliberately narrow: just what this one flow needs, not a
  // blanket memory dump.
  const context = assembleContext({ input: text });

  if (!timezone) {
    return {
      stage: "PLAN",
      status: "BLOCKED_NEEDS_CLARIFICATION",
      reason: "Timezone could not be reliably determined; not assuming UTC, server, or browser timezone.",
      calendarIntent,
      timeResolution,
      context,
    };
  }

  const dayResolution = resolveTemporalExpression(calendarIntent.dayExpression, { now, timezone });

  // PLAN
  if (!dayResolution.resolved || !timeResolution.resolved) {
    return {
      stage: "PLAN",
      status: "BLOCKED_NEEDS_CLARIFICATION",
      reason: "Date and/or time-of-day could not be resolved.",
      calendarIntent,
      dayResolution,
      timeResolution,
      context,
    };
  }

  const plan = {
    capability_id: "calendar.event.create",
    parameters: {
      title: calendarIntent.title,
      date: dayResolution.resolved_date,
      time: timeResolution.time_24h,
      timezone,
    },
  };

  // CAPABILITY -> PROVIDER -> CONNECTION -> AUTHORIZATION -> RISK ->
  // APPROVAL -> EXECUTE -> RESULT -> VERIFY -> OUTCOME -> AUDIT: all
  // handled by the existing, reused Control Layer (Tool Router -> Action
  // Lifecycle). This orchestrator never touches a connector directly.
  const actionRecord = await route({
    capabilityId: plan.capability_id,
    params: { ...plan.parameters, ...extraParams },
    requestedBy,
    why: `User intent: "${text}"`,
    confirmed,
  });

  // LEARNING EVENT — evidence for future learning, not automatically
  // permanent memory or a changed preference.
  const learningEvent = createLearningEvent({
    trigger: "action_outcome",
    evidence: { plan, actionRecord },
    sourceActionId: actionRecord.action_id,
  });

  return {
    stage: "COMPLETE",
    basicUnderstanding,
    calendarIntent,
    dayResolution,
    timeResolution,
    context,
    plan,
    action: actionRecord,
    learningEvent,
  };
}

module.exports = { handleIntent };
