"use strict";

const { ResultStatus } = require("../shared/constants");

// Generic verification contract used by the action lifecycle: given an
// independent check, decide the verified outcome. A provider returning a
// response is never, by itself, treated as SUCCESS.
function verifyOutcome(independentCheck) {
  if (typeof independentCheck !== "function") {
    return { verified: false, outcome: ResultStatus.UNKNOWN, reason: "No independent verification method available." };
  }
  try {
    const matches = independentCheck();
    return { verified: !!matches, outcome: matches ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
  } catch (err) {
    return { verified: false, outcome: ResultStatus.UNKNOWN, reason: "Verification check threw: " + err.message };
  }
}

module.exports = { verifyOutcome };
