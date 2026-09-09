"use strict";

// Smallest appropriate persistence for this milestone: in-memory, scoped
// by user_scope so private and public conversations can never mix and one
// user's session can never read another's. Real build swaps the Map for
// Firestore behind these same four functions — nothing above this module
// needs to change when that happens (same pattern as credentials/reference.js).
const conversations = new Map(); // session_id -> { user_scope, messages: [] }

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
  return record;
}

function _reset() {
  conversations.clear();
}

module.exports = { getConversation, appendMessage, _reset };
