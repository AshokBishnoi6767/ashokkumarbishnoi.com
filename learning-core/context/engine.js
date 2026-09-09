"use strict";

// Deliberate and traceable: returns which sources were actually selected
// and why, rather than dumping all memory/knowledge into the result. A
// later phase adds real relevance ranking; this phase establishes the
// shape so that ranking has somewhere to plug in.
function assembleContext({ input, recentConversation = [], relevantMemories = [], relevantKnowledge = [] } = {}) {
  const sourcesUsed = [];
  if (input) sourcesUsed.push("current_input");
  if (recentConversation.length) sourcesUsed.push("recent_conversation");
  if (relevantMemories.length) sourcesUsed.push("relevant_memories");
  if (relevantKnowledge.length) sourcesUsed.push("relevant_knowledge");

  return {
    current_input: input || null,
    recent_conversation: recentConversation,
    relevant_memories: relevantMemories,
    relevant_knowledge: relevantKnowledge,
    sources_used: sourcesUsed,
    assembled_at: new Date().toISOString(),
  };
}

module.exports = { assembleContext };
