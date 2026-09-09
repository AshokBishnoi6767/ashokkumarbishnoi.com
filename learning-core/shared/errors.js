"use strict";

// Reserved for genuine internal failures (a connector throwing, a
// programming error). Expected control-flow outcomes — not authorized,
// pending confirmation, capability missing — are represented as status
// values in the action record, not exceptions; see integration/actions/lifecycle.js.

class LearningCoreError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "LearningCoreError";
    this.code = code;
    this.details = details || null;
  }
}

module.exports = { LearningCoreError };
