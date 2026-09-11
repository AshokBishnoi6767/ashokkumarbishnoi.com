"use strict";

// Native Trinity response attempt — the deterministic-first entry point
// shared by both live chat surfaces (publicAgent.js / privateAgent.js).
//
// TRINITY MUST NOT REQUIRE AN EXTERNAL LLM TO OPERATE: this module tries
// only capabilities genuinely implemented and answerable with zero
// ambiguity from a single message — closed-form arithmetic today, via
// the real Mathematical Engine (model/taskRouter.js -> math/engine.js).
// Anything not recognized returns { matched: false } so the caller falls
// through to a connected model (if any) or an honest UNKNOWN/UNSUPPORTED.
// This module never calls an external provider and never guesses.
const { extractArithmeticIntent } = require("../language/mathIntent");
const { routeTask, TaskType } = require("../model/taskRouter");

async function attemptNative(message) {
  if (typeof message !== "string") return { matched: false };

  const arithmetic = extractArithmeticIntent(message);
  if (arithmetic.matched) {
    const { result: mathResult } = await routeTask({
      taskType: TaskType.ARITHMETIC,
      args: { operation: arithmetic.operation, params: arithmetic.params },
    });
    if (mathResult.valid) {
      return { matched: true, status: "VERIFIED", reply: `${arithmetic.expression} = ${mathResult.output}` };
    }
    return { matched: true, status: "CONTRADICTED", reply: `That expression has no valid result: ${mathResult.error}` };
  }

  return { matched: false };
}

module.exports = { attemptNative };
