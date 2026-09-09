"use strict";

// Single source of truth for enums shared across every learning-core
// subsystem. Nothing else in this tree should redefine these.

const ToolStatus = Object.freeze({
  ENABLED: "ENABLED",
  DISABLED: "DISABLED",
  PLANNED: "PLANNED",
});

const AuthState = Object.freeze({
  CONNECTED: "CONNECTED",
  AUTHENTICATED: "AUTHENTICATED",
  AUTHORIZED: "AUTHORIZED",
  PARTIALLY_AUTHORIZED: "PARTIALLY_AUTHORIZED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
  DISCONNECTED: "DISCONNECTED",
  ERROR: "ERROR",
});

const AuthorityLevel = Object.freeze({
  READ: "READ",
  PROPOSE: "PROPOSE",
  EXECUTE: "EXECUTE",
});

const RiskLevel = Object.freeze({
  READ_ONLY: "READ_ONLY",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const ActionStatus = Object.freeze({
  CAPABILITY_NOT_AVAILABLE: "CAPABILITY_NOT_AVAILABLE",
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  COMPLETED: "COMPLETED",
});

const ResultStatus = Object.freeze({
  EXPECTED: "EXPECTED",
  SUCCESS: "SUCCESS",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
  BLOCKED: "BLOCKED",
  RECOVERING: "RECOVERING",
});

const EventStatus = Object.freeze({
  PROCESSED: "PROCESSED",
  DUPLICATE: "DUPLICATE",
  REJECTED: "REJECTED",
});

const TruthState = Object.freeze({
  KNOWN: "KNOWN",
  UNKNOWN: "UNKNOWN",
  HYPOTHESIS: "HYPOTHESIS",
  POSSIBLE: "POSSIBLE",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
});

const Modality = Object.freeze({
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  AUDIO: "AUDIO",
  VIDEO: "VIDEO",
  PDF: "PDF",
  DOCX: "DOCX",
  XLSX: "XLSX",
  CSV: "CSV",
  PPTX: "PPTX",
  TXT: "TXT",
  STRUCTURED_DATA: "STRUCTURED_DATA",
  TOOL_RESULT: "TOOL_RESULT",
  EVENT: "EVENT",
});

const ProcessingStatus = Object.freeze({
  RECEIVED: "RECEIVED",
  PARSED: "PARSED",
  UNDERSTOOD: "UNDERSTOOD",
  FAILED: "FAILED",
});

const MemoryClass = Object.freeze({
  WORKING: "WORKING",
  EPISODIC: "EPISODIC",
  SEMANTIC: "SEMANTIC",
  PROJECT: "PROJECT",
  PREFERENCE: "PREFERENCE",
  LEARNED_PATTERN: "LEARNED_PATTERN",
  PROVENANCE: "PROVENANCE",
});

module.exports = {
  ToolStatus,
  AuthState,
  AuthorityLevel,
  RiskLevel,
  ActionStatus,
  ResultStatus,
  EventStatus,
  TruthState,
  Modality,
  ProcessingStatus,
  MemoryClass,
};
