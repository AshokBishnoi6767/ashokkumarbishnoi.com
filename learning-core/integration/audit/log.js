"use strict";

// In-memory only for this proof-of-concept. Never holds secret values —
// only who/what/when/why/tool/capability/authorization/result/verified/outcome.
const AUDIT_LOG = [];

function recordAudit(entry) {
  AUDIT_LOG.push(entry);
  return entry;
}

function listAudit() {
  return AUDIT_LOG.slice();
}

module.exports = { recordAudit, listAudit };
