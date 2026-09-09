"use strict";

// Single source of truth for enums shared across every learning-core
// subsystem. Nothing else in this tree should redefine these.

const ToolStatus = Object.freeze({
  ENABLED: "ENABLED",
  DISABLED: "DISABLED",
  PLANNED: "PLANNED",
});

const AuthState = Object.freeze({
  DISCONNECTED: "DISCONNECTED",
  CONNECTED: "CONNECTED",
  AUTHENTICATED: "AUTHENTICATED",
  AUTHORIZED: "AUTHORIZED",
  PARTIALLY_AUTHORIZED: "PARTIALLY_AUTHORIZED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
  ERROR: "ERROR",
  UNKNOWN: "UNKNOWN",
});

// Provider Registry status — distinct from AuthState/ToolStatus. A provider
// can be SUPPORTED (a connector is feasible) long before it is IMPLEMENTED
// (code exists), CONNECTED (a live session exists), or AUTHORIZED (that
// session actually has the scopes a capability needs).
const ProviderStatus = Object.freeze({
  SUPPORTED: "SUPPORTED",
  IMPLEMENTED: "IMPLEMENTED",
  CONNECTED: "CONNECTED",
  AUTHORIZED: "AUTHORIZED",
  NOT_CONNECTED: "NOT_CONNECTED",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  UNKNOWN: "UNKNOWN",
  REQUIRES_SPECIAL_ACCESS: "REQUIRES_SPECIAL_ACCESS",
  MANUAL: "MANUAL",
});

const CapabilityStatus = Object.freeze({
  SUPPORTED: "SUPPORTED",
  POSSIBLE: "POSSIBLE",
  REQUIRES_SPECIAL_ACCESS: "REQUIRES_SPECIAL_ACCESS",
  MANUAL: "MANUAL",
  UNKNOWN: "UNKNOWN",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  DISABLED: "DISABLED",
});

const HealthState = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  AUTH_EXPIRED: "AUTH_EXPIRED",
  AUTH_REVOKED: "AUTH_REVOKED",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  UNKNOWN: "UNKNOWN",
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
  ProviderStatus,
  CapabilityStatus,
  HealthState,
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
