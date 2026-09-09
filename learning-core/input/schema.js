"use strict";

const { newInputId } = require("../shared/ids");
const { Modality, ProcessingStatus } = require("../shared/constants");

// Provider-independent normalized input. Every modality (text today; image/
// audio/video/documents later) produces this same shape so downstream
// layers never need to know what produced it.
function createInput({ modality, source, sessionId, userScope, content, originalReference, timestamp }) {
  if (!modality || !Modality[modality]) {
    throw new TypeError(`Unknown modality: ${modality}`);
  }
  if (!source) {
    throw new TypeError("Input requires a source.");
  }
  const ts = timestamp || new Date().toISOString();
  return {
    input_id: newInputId(),
    source,
    timestamp: ts,
    session_id: sessionId || null,
    user_scope: userScope || null,
    modality,
    content: content === undefined ? null : content,
    original_reference: originalReference || null,
    processing_status: ProcessingStatus.RECEIVED,
    provenance: { origin: source, captured_at: ts },
  };
}

module.exports = { createInput };
