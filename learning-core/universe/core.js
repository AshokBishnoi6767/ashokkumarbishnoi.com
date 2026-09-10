"use strict";

/**
 * Trinity Core — the shared computational substrate v0.1
 *
 * CORE = universal computational substrate. REALM = specialized
 * intelligence/domain. This module makes that separation explicit in
 * code by exposing references to the EXISTING, already-built,
 * already-tested subsystems every realm may draw on — it does not
 * reimplement any of them, and it contains zero domain-specific
 * knowledge itself (no "how refunds work," no "how physics works").
 *
 * A realm's `execute` function typically closes over one or more of
 * these services rather than importing them ad hoc — e.g. a
 * Mathematics realm's execute() calls TrinityCore.mathematics.add(),
 * a Policy/Customer realm's calls TrinityCore.policy.evaluatePolicy().
 * Nothing REQUIRES a realm to go through this object instead of
 * requiring the module directly; it exists for discoverability and to
 * keep "what does the Core provide" answerable by reading one file.
 */

const memory = require("../memory/store");
const reasoning = require("../language/realm/reasoningRealm");
const hypothesis = require("../language/realm/hypothesisRealm");
const verification = require("../language/realm/verificationRealm");
const probability = require("../language/realm/probabilityRealm");
const mathematics = require("../math/engine");
const policy = require("../policy/engine");
const safety = require("../integration/safety/constraintGate");
const modelRouting = require("../model/taskRouter");
const benchmarking = require("../core/benchmark");
const feedback = require("../learning/feedbackLoop");
const learning = require("../learning/candidatePipeline");
const registries = require("./registry");
const shared = require("../shared/constants");

const TrinityCore = Object.freeze({
  memory,
  reasoning,
  hypothesis,
  verification,
  probability,
  mathematics,
  policy,
  safety,
  modelRouting,
  benchmarking,
  feedback,
  learning,
  registries,
  constants: shared,
});

module.exports = TrinityCore;
