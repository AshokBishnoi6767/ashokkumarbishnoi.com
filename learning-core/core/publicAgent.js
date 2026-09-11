"use strict";

// PUBLIC agent — the Industry 4.0 Navigator. Deliberately does NOT import
// the Tool Router, Action Lifecycle, connectors, or any private module.
// This is a structural guarantee, not just a policy: this file has no way
// to reach a capability, a connector, or Ashok's private conversation
// history even if its logic were compromised by malicious input, because
// the code to do so is never required into this module at all.
const { buildPublicSystemPrompt } = require("./publicContext");
const { pickConnected, safeInvoke } = require("../model/registry");
const { appendMessage, getConversation } = require("../persistence/store");
const { attemptNative } = require("./nativeResponder");

const USER_SCOPE = "public:visitor";

async function handleMessage({ message, sessionId }) {
  if (typeof message !== "string" || !message.trim()) {
    return { status: "INVALID_REQUEST", reason: "message is required and must be a non-empty string." };
  }

  appendMessage(sessionId, USER_SCOPE, { role: "user", content: message });

  // NATIVE_TRINITY is the primary backend: deterministic capabilities are
  // tried first, before any external model is even selected. An external
  // provider is only ever reached for what nothing native here can do.
  const native = await attemptNative(message);
  if (native.matched) {
    appendMessage(sessionId, USER_SCOPE, { role: "assistant", content: native.reply });
    return { status: native.status, reply: native.reply };
  }

  const { provider } = pickConnected();
  const conversation = getConversation(sessionId, USER_SCOPE);
  const messages = conversation.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const modelResult = await safeInvoke(provider, { system: buildPublicSystemPrompt(), messages });

  if (modelResult.status !== "SUCCESS") {
    return { status: modelResult.status, reason: modelResult.reason };
  }

  appendMessage(sessionId, USER_SCOPE, { role: "assistant", content: modelResult.output });
  return { status: "SUCCESS", reply: modelResult.output };
}

module.exports = { handleMessage, USER_SCOPE };
