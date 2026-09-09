"use strict";

// PRIVATE agent — full access to the Control Layer's action pipeline
// (through the existing, unmodified Tool Router / Action Lifecycle) and to
// Ashok's own conversation history and memory. Never reachable by anonymous
// visitors — the server enforces that boundary (see server/index.js), not
// this file.
//
// Personal Intelligence Layer: preference/decision/correction capture and
// relevant-memory retrieval below are deterministic pattern matches, the
// same style as calendarIntent.js — not a claim of real NLU. That's what
// lets personalization work identically whether or not a real model
// provider is connected: recognized patterns are handled here directly;
// anything else falls through to the model (when connected) with whatever
// relevant memory was actually retrieved, never invented.
const { extractCalendarCreateIntent } = require("../language/calendarIntent");
const { extractCorrection, extractDecisionStatement, extractPreferenceStatement } = require("../language/memoryIntent");
const { understand } = require("../language/understanding");
const { handleIntent } = require("./personalAI");
const { pickConnected, safeInvoke } = require("../model/registry");
const { appendMessage, getConversation } = require("../persistence/store");
const memoryStore = require("../memory/store");
const { retrieveRelevantMemory, retrieveRelevantMemoryInClass } = require("../context/memoryRetrieval");
const { recordCorrection } = require("../learning/events");
const knowledge = require("../knowledge/graph");
const { createInput } = require("../input/schema");
const { MemoryClass, TruthState, Modality } = require("../shared/constants");

const USER_SCOPE = "private:ashok";

function buildSystemPrompt(relevantMemories) {
  const lines = [
    "You are Ashok's private AI agent, running inside his personal command center.",
    "You have a real memory system. Below is exactly what's stored and relevant to this message — nothing else exists beyond it and this conversation. Treat KNOWN/VERIFIED items as established. Treat HYPOTHESIS/POSSIBLE items as your own past guesses, not confirmed truth, and say so if you rely on one.",
    "You cannot execute any action yourself. A separate, deterministic authorization system decides what may actually run; you may only describe or propose.",
    "Never invent a preference, project, decision, or memory that isn't listed below or stated in this conversation. If you don't know something, say so plainly instead of guessing.",
  ];
  if (relevantMemories.length) {
    lines.push("Relevant memory for this message:");
    for (const m of relevantMemories) {
      lines.push(`- [${m.type}, ${m.truth_state}${m.confidence != null ? `, confidence ${m.confidence}` : ""}] ${m.content}`);
    }
  } else {
    lines.push("No stored memory is relevant to this specific message.");
  }
  return lines.join("\n");
}

function summarizeContext(relevantMemories) {
  return { memory_ids_used: relevantMemories.map((m) => m.memory_id), count: relevantMemories.length };
}

// Multimodal inputs (images/audio/video/documents) arrive pre-extracted —
// the caller supplies what was OBSERVED (what the file literally shows/
// says) and, optionally, what was INFERRED from it. These are stored as
// separate records with different truth_state on purpose: an observation
// the owner directly reports is KNOWN; an inference is HYPOTHESIS and is
// never silently upgraded to fact. This module does not perform real OCR/
// ASR/vision itself — no such provider is connected — it guarantees the
// epistemic distinction is preserved once content does arrive.
function captureAttachments(attachments, sessionId) {
  const stored = [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") continue;
    const { modality, observation, inference, reference } = attachment;
    if (!modality || !Modality[modality]) continue;

    const input = createInput({
      modality,
      source: "user_upload",
      sessionId,
      userScope: USER_SCOPE,
      content: { observation: observation || null, inference: inference || null },
      originalReference: reference || null,
    });

    if (typeof observation === "string" && observation.trim()) {
      stored.push(
        memoryStore.remember(MemoryClass.EPISODIC, {
          type: "observation",
          content: observation.trim(),
          source: "user_upload",
          sourceReference: input.input_id,
          context: { modality, original_reference: reference || null },
          truthState: TruthState.KNOWN,
          confidence: 1,
          userScope: USER_SCOPE,
        })
      );
    }
    if (typeof inference === "string" && inference.trim()) {
      stored.push(
        memoryStore.remember(MemoryClass.EPISODIC, {
          type: "inference",
          content: inference.trim(),
          source: "user_upload",
          sourceReference: input.input_id,
          context: { modality, original_reference: reference || null },
          truthState: TruthState.HYPOTHESIS,
          confidence: 0.4,
          userScope: USER_SCOPE,
        })
      );
    }
  }
  return stored;
}

// Correction: the explicit "no, actually X" family. Looks for the most
// relevant existing memory (any personalization class) to supersede. If
// found, the old record is marked superseded (never deleted — provenance
// stays intact) and linked from the new one via related_memories. A
// correction is also always recorded as a learning event distinct from a
// plain preference update, per learning/events.js's existing "candidate,
// never auto-promoted" contract.
function captureCorrection(text, sessionId) {
  const extraction = extractCorrection(text);
  if (!extraction.matched) return null;

  const [previous] = retrieveRelevantMemory({ userScope: USER_SCOPE, text: extraction.statement, limit: 1 });
  let record;
  if (previous) {
    memoryStore.update(previous.memory_class, previous.memory_id, { status: "superseded" });
    record = memoryStore.remember(previous.memory_class, {
      type: "correction",
      content: extraction.statement,
      source: "conversation",
      sourceReference: sessionId,
      truthState: TruthState.KNOWN,
      confidence: 0.9,
      userScope: USER_SCOPE,
      relatedMemories: [previous.memory_id],
    });
  } else {
    record = memoryStore.remember(MemoryClass.SEMANTIC, {
      type: "correction",
      content: extraction.statement,
      source: "conversation",
      sourceReference: sessionId,
      truthState: TruthState.KNOWN,
      confidence: 0.7,
      userScope: USER_SCOPE,
    });
  }
  const learningEvent = recordCorrection({ previousClaim: previous ? previous.content : null, correction: extraction.statement, source: "conversation" });
  return { record, previous, learningEvent };
}

// Decision: recorded as something that happened (EPISODIC), plus a
// knowledge-graph relationship so it participates in entity/relationship
// continuity ("Project A -> decision Y was made"), not just a text blob.
function captureDecision(text, sessionId) {
  const extraction = extractDecisionStatement(text);
  if (!extraction.matched) return null;
  const record = memoryStore.remember(MemoryClass.EPISODIC, {
    type: "decision",
    content: extraction.statement,
    source: "conversation",
    sourceReference: sessionId,
    truthState: TruthState.KNOWN,
    confidence: 0.9,
    userScope: USER_SCOPE,
  });
  knowledge.assertRelationship("ashok", "decided", extraction.statement, { source: "conversation", confidence: 0.9 });
  return { record };
}

// Preference: a plain new statement ("I prefer X") about a topic that
// already has an active preference on file is treated as an implicit
// update — a stated preference is inherently "current state" — but never
// silently: the old record is superseded (not deleted) and linked, and the
// reply explicitly names both the old and new value so the change is
// always visible, never a silent overwrite.
function capturePreference(text, sessionId) {
  const extraction = extractPreferenceStatement(text);
  if (!extraction.matched) return null;

  const [previous] = retrieveRelevantMemoryInClass({ userScope: USER_SCOPE, text: extraction.statement, memoryClass: MemoryClass.PREFERENCE, limit: 1 });
  const changed = previous && previous.content.trim().toLowerCase() !== extraction.statement.trim().toLowerCase();
  if (previous) {
    memoryStore.update(MemoryClass.PREFERENCE, previous.memory_id, { status: "superseded" });
  }
  const record = memoryStore.remember(MemoryClass.PREFERENCE, {
    type: "preference",
    content: extraction.statement,
    source: "conversation",
    sourceReference: sessionId,
    truthState: TruthState.KNOWN,
    confidence: 0.85,
    userScope: USER_SCOPE,
    relatedMemories: previous ? [previous.memory_id] : [],
  });
  return { record, previous: changed ? previous : null };
}

async function handleMessage({ message, sessionId, timezone = null, confirmed = false, testScenario = null, attachments = [] }) {
  if (typeof message !== "string" || !message.trim()) {
    return { status: "INVALID_REQUEST", reason: "message is required and must be a non-empty string." };
  }

  appendMessage(sessionId, USER_SCOPE, { role: "user", content: message });

  const storedAttachments = Array.isArray(attachments) && attachments.length ? captureAttachments(attachments, sessionId) : [];
  const withAttachments = (result) => (storedAttachments.length ? { ...result, attachments_stored: storedAttachments.length } : result);

  // A recognized action request goes through the existing, unmodified
  // Control Layer — capability, provider, connection, authorization, risk,
  // approval, execution, verification, outcome, audit, learning event.
  const calendarIntent = extractCalendarCreateIntent(message);
  if (calendarIntent.matched) {
    const extraParams = testScenario ? { __test_scenario: testScenario } : {};
    const result = await handleIntent({ text: message, requestedBy: "ashok", timezone, confirmed, params: extraParams });
    appendMessage(sessionId, USER_SCOPE, { role: "agent", content: JSON.stringify(result), kind: "action_result" });
    return withAttachments({ status: "ACTION", result });
  }

  // Personal Intelligence Layer: UNDERSTANDING, not AUTHORITY — none of
  // these three write anywhere except this agent's own memory store, and
  // none of them can reach the Tool Router / Action Lifecycle. Storing a
  // preference is never an authorized action; it never needs approval.
  const correction = captureCorrection(message, sessionId);
  if (correction) {
    const reply = correction.previous
      ? `Got it — correcting that. Previously I understood: "${correction.previous.content}". Now: "${correction.record.content}".`
      : `Got it — noted: "${correction.record.content}". (No prior matching memory to correct.)`;
    appendMessage(sessionId, USER_SCOPE, { role: "agent", content: reply, kind: "memory_result" });
    return withAttachments({
      status: "MEMORY_STORED",
      memory_class: correction.previous ? correction.previous.memory_class : MemoryClass.SEMANTIC,
      record: correction.record,
      supersedes: correction.previous ? correction.previous.memory_id : null,
      reply,
    });
  }

  const decision = captureDecision(message, sessionId);
  if (decision) {
    const reply = `Noted the decision: "${decision.record.content}".`;
    appendMessage(sessionId, USER_SCOPE, { role: "agent", content: reply, kind: "memory_result" });
    return withAttachments({ status: "MEMORY_STORED", memory_class: MemoryClass.EPISODIC, record: decision.record, reply });
  }

  const preference = capturePreference(message, sessionId);
  if (preference) {
    const reply = preference.previous
      ? `Got it — updating what I know. Previously: "${preference.previous.content}". Now: "${preference.record.content}".`
      : `Got it — I'll remember that: "${preference.record.content}".`;
    appendMessage(sessionId, USER_SCOPE, { role: "agent", content: reply, kind: "memory_result" });
    return withAttachments({
      status: "MEMORY_STORED",
      memory_class: MemoryClass.PREFERENCE,
      record: preference.record,
      supersedes: preference.previous ? preference.previous.memory_id : null,
      reply,
    });
  }

  // Ambiguity: an unresolved reference ("it"/"that"/"this"/"them") cannot
  // be silently guessed without real coreference resolution (no model
  // connected, and understanding.js explicitly does not claim to do this)
  // — ask, per the instruction not to invent context.
  const basicUnderstanding = understand(message);
  if (basicUnderstanding.ambiguous) {
    const reply = `Could you clarify what you mean? ${basicUnderstanding.ambiguity_reason}`;
    appendMessage(sessionId, USER_SCOPE, { role: "agent", content: reply, kind: "clarification" });
    return withAttachments({ status: "CLARIFICATION_NEEDED", reason: basicUnderstanding.ambiguity_reason, reply });
  }

  // Otherwise: open-ended chat — now with relevant memory actually
  // retrieved (relevance-scored, user-scoped) and included in the system
  // prompt, not the entire store and not nothing.
  const relevantMemories = retrieveRelevantMemory({ userScope: USER_SCOPE, text: message });
  const { provider } = pickConnected();
  const conversation = getConversation(sessionId, USER_SCOPE);
  const messages = conversation.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const modelResult = await safeInvoke(provider, { system: buildSystemPrompt(relevantMemories), messages });

  if (modelResult.status !== "SUCCESS") {
    return withAttachments({ status: modelResult.status, reason: modelResult.reason, context_used: summarizeContext(relevantMemories) });
  }

  appendMessage(sessionId, USER_SCOPE, { role: "assistant", content: modelResult.output });
  return withAttachments({ status: "SUCCESS", reply: modelResult.output, context_used: summarizeContext(relevantMemories) });
}

module.exports = { handleMessage, USER_SCOPE, buildSystemPrompt };
