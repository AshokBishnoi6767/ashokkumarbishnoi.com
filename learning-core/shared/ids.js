"use strict";

const crypto = require("crypto");

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

module.exports = {
  newCorrelationId: () => makeId("corr"),
  newSessionId: () => makeId("sess"),
  newActionId: () => makeId("action"),
  newEventId: () => makeId("event"),
  newWorkflowId: () => makeId("workflow"),
  newMemoryId: () => makeId("mem"),
  newInputId: () => makeId("input"),
  newApprovalId: () => makeId("approval"),
  newTokenId: () => makeId("token"),
};
