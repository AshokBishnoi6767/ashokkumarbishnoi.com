"use strict";

// Durable audit trail — backed by fileStore so the action/outcome record
// survives a process restart. Never holds secret values — only
// who/what/when/why/tool/capability/authorization/result/verified/outcome.
const fileStore = require("../../persistence/fileStore");

const COLLECTION = "audit_log";

let AUDIT_LOG = fileStore.load(COLLECTION, []);

function recordAudit(entry) {
  AUDIT_LOG.push(entry);
  fileStore.save(COLLECTION, AUDIT_LOG);
  return entry;
}

function listAudit() {
  return AUDIT_LOG.slice();
}

function _reset() {
  AUDIT_LOG = [];
  fileStore.save(COLLECTION, AUDIT_LOG);
}

module.exports = { recordAudit, listAudit, _reset };
