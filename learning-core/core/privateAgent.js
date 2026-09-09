"use strict";

// PRIVATE agent — full access to the Control Layer's action pipeline
// (through the existing, unmodified Tool Router / Action Lifecycle) and to
// Ashok's own conversation history. Never reachable by anonymous visitors
// — the server enforces that boundary (see server/index.js), not this file.
const { extractCalendarCreateIntent } = require("../language/calendarIntent");
const { handleIntent } = require("./personalAI");
const { pickConnected, safeInvoke } = require("../model/registry");
const { appendMessage, getConversation } = require("../persistence/store");

const USER_SCOPE = "private:ashok";

const SYSTEM_PROMPT = [
  "You are Ashok's private AI agent, running inside his personal command center.",
  "You may discuss his projects, tasks, and priorities as he describes them to you in this conversation, but you have no memory system connected yet — you only know what has been said in this conversation.",
  "You cannot execute any action yourself. A separate, deterministic authorization system decides what may actually run; you may only describe or propose.",
  "If you don't know something because no real data source is connected, say so plainly instead of guessing.",
].join("\n");

async function handleMessage({ message, sessionId, timezone = null, confirmed = false, testScenario = null }) {
  if (typeof message !== "string" || !message.trim()) {
    return { status: "INVALID_REQUEST", reason: "message is required and must be a non-empty string." };
  }

  appendMessage(sessionId, USER_SCOPE, { role: "user", content: message });

  // A recognized action request goes through the existing, unmodified
  // Control Layer — capability, provider, connection, authorization, risk,
  // approval, execution, verification, outcome, audit, learning event.
  const calendarIntent = extractCalendarCreateIntent(message);
  if (calendarIntent.matched) {
    // testScenario is test-only plumbing (see integration/connectors/testCalendarConnector.js)
    // to exercise deterministic failure modes end-to-end through this exact
    // path. It has no effect against the real Google Calendar connector.
    const extraParams = testScenario ? { __test_scenario: testScenario } : {};
    const result = await handleIntent({ text: message, requestedBy: "ashok", timezone, confirmed, params: extraParams });
    appendMessage(sessionId, USER_SCOPE, { role: "agent", content: JSON.stringify(result), kind: "action_result" });
    return { status: "ACTION", result };
  }

  // Otherwise: open-ended chat through the model provider abstraction.
  const { provider } = pickConnected();
  const conversation = getConversation(sessionId, USER_SCOPE);
  const messages = conversation.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const modelResult = await safeInvoke(provider, { system: SYSTEM_PROMPT, messages });

  if (modelResult.status !== "SUCCESS") {
    return { status: modelResult.status, reason: modelResult.reason };
  }

  appendMessage(sessionId, USER_SCOPE, { role: "assistant", content: modelResult.output });
  return { status: "SUCCESS", reply: modelResult.output };
}

module.exports = { handleMessage, USER_SCOPE };
