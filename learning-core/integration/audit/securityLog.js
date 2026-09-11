"use strict";

// Security-event audit trail — distinct from the action audit
// (integration/audit/log.js), which records action-lifecycle outcomes
// (capability/authorization/risk/execution/verification). This records
// the SECURITY decisions around that: authentication failures,
// authorization denials, rate-limit trips — never mixed into the action
// log's own contract, so a security review can read one collection
// without filtering out unrelated action noise. Same fileStore-backed
// durability, same no-secrets rule as every other store in this tree.
const fileStore = require("../../persistence/fileStore");
const logger = require("../../shared/logger");

const COLLECTION = "security_log";

let SECURITY_LOG = fileStore.load(COLLECTION, []);

// Every field passes through logger's own redaction map before being
// persisted — the same enforcement point already relied on for stdout
// logging, not a second, divergent redaction rule for this collection.
function recordSecurityEvent(entry) {
  const record = { ts: new Date().toISOString(), ...logger._redact(entry) };
  SECURITY_LOG.push(record);
  fileStore.save(COLLECTION, SECURITY_LOG);
  return record;
}

function listSecurityEvents() {
  return SECURITY_LOG.slice();
}

function _reset() {
  SECURITY_LOG = [];
  fileStore.save(COLLECTION, SECURITY_LOG);
}

module.exports = { recordSecurityEvent, listSecurityEvents, _reset };
