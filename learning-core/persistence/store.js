"use strict";

// Conversation persistence, scoped by user_scope so private and public
// conversations can never mix and one user's session can never read
// another's. Backed by fileStore so a conversation survives a process
// restart — the in-memory Map here is a read cache populated from disk at
// load time, not the source of truth. Real build swaps fileStore's
// load/save calls for Firestore behind these same four functions — nothing
// above this module needs to change when that happens (same pattern as
// credentials/reference.js).
const fileStore = require("./fileStore");

const COLLECTION = "conversations";

function loadConversations() {
  const raw = fileStore.load(COLLECTION, []);
  return new Map(raw.map((record) => [record.session_id, record]));
}

const conversations = loadConversations();

function persist() {
  fileStore.save(COLLECTION, Array.from(conversations.values()));
}

function getConversation(sessionId, userScope) {
  const record = conversations.get(sessionId);
  if (!record || record.user_scope !== userScope) return { session_id: sessionId, user_scope: userScope, messages: [] };
  return record;
}

function appendMessage(sessionId, userScope, message) {
  const existing = conversations.get(sessionId);
  if (existing && existing.user_scope !== userScope) {
    throw new Error("session_id belongs to a different user_scope");
  }
  const record = existing || { session_id: sessionId, user_scope: userScope, messages: [] };
  record.messages.push({ ...message, at: new Date().toISOString() });
  conversations.set(sessionId, record);
  persist();
  return record;
}

function _reset() {
  conversations.clear();
  persist();
}

module.exports = { getConversation, appendMessage, _reset };
