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
  // Added for the Reasoning Realm: a record produced by rule application
  // over other records, never by direct extraction. Distinct from every
  // value above — DERIVED is never auto-promoted to KNOWN or VERIFIED
  // merely because a rule fired; that promotion is the Verification
  // Realm's job, working from independent evidence.
  DERIVED: "DERIVED",
});

// Verification Realm's own outcome vocabulary — deliberately separate
// from TruthState (representation) and from ResultStatus (action
// execution outcomes above). A claim can be UNKNOWN in TruthState and
// still receive any of these VerificationOutcome values once checked.
const VerificationOutcome = Object.freeze({
  VERIFIED: "VERIFIED",
  PARTIALLY_VERIFIED: "PARTIALLY_VERIFIED",
  CONTRADICTED: "CONTRADICTED",
  UNKNOWN: "UNKNOWN",
  NOT_VERIFIABLE: "NOT_VERIFIABLE",
});

// Hypothesis Realm's own status vocabulary. A hypothesis is never
// deleted or overwritten when evidence shifts — its status changes,
// and prior states remain reconstructable from provenance.
const HypothesisStatus = Object.freeze({
  PROPOSED: "PROPOSED",
  SUPPORTED: "SUPPORTED",
  CONTRADICTED: "CONTRADICTED",
  // Both supporting AND contradicting evidence exist — deliberately
  // distinct from CONTRADICTED (contradicting evidence only). The
  // Hypothesis Realm never collapses this ambiguity into a forced pick.
  DISPUTED: "DISPUTED",
  WITHDRAWN: "WITHDRAWN",
});

// Probability is a distinct mathematical concept from confidence — see
// memory/types.js's comment on why confidence and truth_state are never
// collapsed into each other; the same separation applies here. Until a
// mathematically/statistically justified probability value exists
// (e.g. from a model that actually computes one), a proposition's
// probability field must read NOT_DEFINED — never a guessed number,
// and never derived from confidence or uncertainty.
const ProbabilityStatus = Object.freeze({
  NOT_DEFINED: "NOT_DEFINED",
});

// Uncertainty is represented structurally, not computed as 1-confidence
// or 1-probability. PRESENT is the honest default for anything that has
// not been independently verified, regardless of how deterministic its
// extraction was.
const UncertaintyStatus = Object.freeze({
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
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
  VerificationOutcome,
  HypothesisStatus,
  ProbabilityStatus,
  UncertaintyStatus,
  Modality,
  ProcessingStatus,
  MemoryClass,
};
