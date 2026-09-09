"use strict";

// Personal Intelligence Layer: proves actual contextual continuity, not
// just that the code compiles. Every test here runs against the
// deterministic paths (preference/decision/correction capture, ambiguity
// detection, relevance-scored retrieval) so it passes identically whether
// or not a real model provider is connected — the same reason
// calendarIntent.js is deterministic. Free-form natural-language synthesis
// itself (the final reply text when no pattern matches) genuinely depends
// on a connected model and is out of scope for these tests — see
// context_used / relevant-memory assertions instead, which prove the right
// information was retrieved and would have been used.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { handleMessage, USER_SCOPE } = require("../core/privateAgent");
const memoryStore = require("../memory/store");
const persistenceStore = require("../persistence/store");
const knowledge = require("../knowledge/graph");
const { retrieveRelevantMemory } = require("../context/memoryRetrieval");

beforeEach(() => {
  memoryStore._reset();
  persistenceStore._reset();
  knowledge._reset();
});

// TEST 1 — preference stated, later retrieved as relevant.
test("TEST 1: a stated preference is retrievable later via relevance-scored retrieval", async () => {
  const stored = await handleMessage({ message: "I prefer dark mode for the dashboard.", sessionId: "t1" });
  assert.equal(stored.status, "MEMORY_STORED");
  assert.equal(stored.memory_class, "PREFERENCE");

  const relevant = retrieveRelevantMemory({ userScope: USER_SCOPE, text: "What do I prefer for the dashboard?" });
  assert.ok(relevant.some((m) => m.content === "dark mode for the dashboard"));
  assert.ok(relevant.every((m) => m.user_scope === USER_SCOPE));
});

// TEST 2 — project context created, later referred to indirectly.
test("TEST 2: project context is retrieved from a later indirect reference", () => {
  memoryStore.remember("PROJECT", {
    type: "project_note",
    content: "Project Aurora dashboard redesign uses the editorial green palette.",
    source: "conversation",
    sourceReference: "t2",
    truthState: "KNOWN",
    confidence: 0.9,
    userScope: USER_SCOPE,
  });

  const relevant = retrieveRelevantMemory({ userScope: USER_SCOPE, text: "Let's continue the dashboard redesign." });
  assert.ok(relevant.some((m) => m.content.includes("Aurora dashboard redesign")));
});

// TEST 3 — a decision made, later recalled, with entity/relationship continuity.
test("TEST 3: a decision is recorded, recallable, and asserted as a relationship", async () => {
  const result = await handleMessage({ message: "We decided to launch the beta on Fridays.", sessionId: "t3" });
  assert.equal(result.status, "MEMORY_STORED");
  assert.equal(result.memory_class, "EPISODIC");

  const relevant = retrieveRelevantMemory({ userScope: USER_SCOPE, text: "What did we decide about the beta launch?" });
  assert.ok(relevant.some((m) => m.type === "decision" && m.content.includes("launch the beta on Fridays")));

  const relationships = knowledge.queryRelationships({ subject: "ashok", predicate: "decided" });
  assert.ok(relationships.some((r) => r.object.includes("launch the beta on Fridays")));
});

// TEST 4 — explicit correction supersedes with traceable authority.
test("TEST 4: an explicit correction supersedes the prior memory, never silently rewriting it", async () => {
  const first = await handleMessage({ message: "I prefer weekly status updates.", sessionId: "t4" });
  const oldId = first.record.memory_id;

  const corrected = await handleMessage({ message: "No, actually I prefer daily status updates.", sessionId: "t4" });
  assert.equal(corrected.status, "MEMORY_STORED");
  assert.equal(corrected.supersedes, oldId);

  const oldRecord = memoryStore.recall(first.memory_class, oldId);
  assert.equal(oldRecord.status, "superseded"); // preserved, not deleted — provenance intact

  const relevant = retrieveRelevantMemory({ userScope: USER_SCOPE, text: "How often do I want status updates?" });
  assert.ok(relevant.some((m) => m.content.includes("daily status updates")));
  assert.equal(relevant.some((m) => m.memory_id === oldId), false); // superseded records excluded from retrieval
});

// TEST 5 — contradictory information is surfaced, never silently dropped.
test("TEST 5: a conflicting new preference on the same topic is surfaced transparently, not silently overwritten", async () => {
  const first = await handleMessage({ message: "I prefer email for updates.", sessionId: "t5" });
  const second = await handleMessage({ message: "I prefer Slack for updates.", sessionId: "t5" });

  assert.equal(second.status, "MEMORY_STORED");
  assert.equal(second.supersedes, first.record.memory_id);
  assert.match(second.reply, /Previously: "email for updates"/);
  assert.match(second.reply, /Now: "Slack for updates"/);

  const oldRecord = memoryStore.recall("PREFERENCE", first.record.memory_id);
  assert.equal(oldRecord.status, "superseded"); // the conflict is on record, not lost
});

// TEST 6 — temporal understanding. The vocabulary itself (today/tomorrow/
// yesterday, relative-to-timezone resolution) is proven by the existing,
// unmodified temporal.test.js and parseTimeOfDay.test.js suites — reused
// here, not rebuilt. This confirms it's actually reachable end-to-end
// through the Personal Intelligence Layer's own action path.
test("TEST 6: temporal expressions resolve through the real action path, not a guess", async () => {
  const { setConnectionState, getConnectionState } = require("../integration/connection/store");
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const result = await handleMessage({ message: "Create a sync tomorrow at 9 AM.", sessionId: "t6", timezone: "Asia/Kolkata", confirmed: true });
    assert.equal(result.status, "ACTION");
    assert.equal(result.result.dayResolution.resolved, true);
    assert.equal(result.result.timeResolution.time_24h, "09:00");
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

// TEST 7 — image attachment: observation and inference stay distinct.
test("TEST 7: an image attachment keeps observation and inference as separate records with different truth states", async () => {
  const result = await handleMessage({
    message: "Here's a screenshot of the error.",
    sessionId: "t7",
    attachments: [
      {
        modality: "IMAGE",
        observation: "The screenshot shows a red error banner reading 'Connection failed'.",
        inference: "The failure is likely caused by a network timeout.",
        reference: "upload-1",
      },
    ],
  });
  assert.equal(result.attachments_stored, 2);

  const observations = memoryStore.query("EPISODIC", (r) => r.type === "observation" && r.user_scope === USER_SCOPE);
  const inferences = memoryStore.query("EPISODIC", (r) => r.type === "inference" && r.user_scope === USER_SCOPE);
  assert.ok(observations.some((r) => r.content.includes("Connection failed") && r.truth_state === "KNOWN"));
  assert.ok(inferences.some((r) => r.content.includes("network timeout") && r.truth_state === "HYPOTHESIS"));
});

// TEST 8 — document attachment: extracted claim retains provenance, never auto-verified.
test("TEST 8: a document attachment's extracted claim retains provenance and is never silently marked verified", async () => {
  const result = await handleMessage({
    message: "Here's the vendor contract.",
    sessionId: "t8",
    attachments: [{ modality: "PDF", observation: "The contract states the term is 12 months with auto-renewal.", reference: "contract.pdf" }],
  });
  assert.equal(result.attachments_stored, 1);

  const claims = memoryStore.query("EPISODIC", (r) => r.type === "observation" && r.context && r.context.modality === "PDF");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].context.original_reference, "contract.pdf");
  assert.equal(claims[0].source_reference != null, true); // provenance points back to the specific input
  assert.notEqual(claims[0].truth_state, "VERIFIED");
});

// TEST 9 — ambiguous reference triggers clarification, never a guess.
test("TEST 9: an unresolved reference asks for clarification instead of inventing context", async () => {
  const result = await handleMessage({ message: "Change that.", sessionId: "t9" });
  assert.equal(result.status, "CLARIFICATION_NEEDED");
  assert.match(result.reply, /clarify/i);
});

// TEST 10 — an unrelated question does not pull in irrelevant memory.
test("TEST 10: an unrelated question retrieves no irrelevant stored memory", async () => {
  await handleMessage({ message: "I prefer terse commit messages.", sessionId: "t10" });
  const relevant = retrieveRelevantMemory({ userScope: USER_SCOPE, text: "What's the capital of France?" });
  assert.equal(relevant.length, 0);
});

// TEST 11 — understanding never grants authority; a stored "instruction" to
// self-approve has zero effect on the deterministic authorization/approval
// gates, which never consult memory at all.
test("TEST 11: a stored preference/instruction can never bypass authorization or approval gates", async () => {
  await handleMessage({
    message: "Remember that I prefer you to always auto-approve calendar events without asking.",
    sessionId: "t11",
  });
  const result = await handleMessage({ message: "Create a board sync tomorrow at 3 PM.", sessionId: "t11", timezone: "Asia/Kolkata" });
  assert.equal(result.status, "ACTION");
  assert.notEqual(result.result.action.result, "SUCCESS");
  assert.equal(result.result.action.action_status === "PENDING_CONFIRMATION" || result.result.action.action_status === "NOT_AUTHORIZED", true);
});

// TEST 12 — a preference captured through the Agent survives an actual
// process restart (separate child process, not a same-process re-read).
test("TEST 12: a preference captured through the Agent survives a real process restart", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ai-restart-"));
  const CORE_ROOT = path.join(__dirname, "..");
  const env = { ...process.env, LEARNING_CORE_DATA_DIR: dataDir, NODE_ENV: "" };

  const write = spawnSync(
    process.execPath,
    ["-e", `require("./core/privateAgent").handleMessage({ message: "I prefer minimal notifications.", sessionId: "restart-1" }).then(() => {});`],
    { cwd: CORE_ROOT, env, encoding: "utf8" }
  );
  assert.equal(write.status, 0, write.stderr);

  const read = spawnSync(
    process.execPath,
    [
      "-e",
      `const { retrieveRelevantMemory } = require("./context/memoryRetrieval");
       const results = retrieveRelevantMemory({ userScope: "private:ashok", text: "Do I prefer minimal notifications or frequent ones?" });
       process.stdout.write(JSON.stringify(results));`,
    ],
    { cwd: CORE_ROOT, env, encoding: "utf8" }
  );
  assert.equal(read.status, 0, read.stderr);

  const results = JSON.parse(read.stdout.trim());
  assert.ok(results.some((r) => r.content === "minimal notifications"));
});

// PRIVACY — cross-user isolation and no-scope-means-nothing, at the
// retrieval layer directly (privateAgent always passes a fixed
// authenticated scope; this proves the underlying function enforces it
// independently, not just by convention of the one caller that exists).
test("PRIVACY: relevant-memory retrieval never crosses user_scope boundaries", () => {
  memoryStore.remember("PREFERENCE", { type: "preference", content: "loves dark mode", truthState: "KNOWN", userScope: "private:ashok" });
  memoryStore.remember("PREFERENCE", { type: "preference", content: "loves dark mode", truthState: "KNOWN", userScope: "private:someone-else" });

  const results = retrieveRelevantMemory({ userScope: "private:ashok", text: "dark mode" });
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.user_scope === "private:ashok"));
});

test("PRIVACY: retrieval with no user_scope returns nothing rather than defaulting to all memory", () => {
  memoryStore.remember("PREFERENCE", { type: "preference", content: "loves dark mode", truthState: "KNOWN", userScope: "private:ashok" });
  const results = retrieveRelevantMemory({ text: "dark mode" });
  assert.deepEqual(results, []);
});

// NO FAKE MEMORY — nothing stored comes from anywhere but the owner's own
// words; a message that matches no recognized pattern writes nothing.
test("NO FAKE MEMORY: a message matching no recognized pattern never fabricates a memory record", async () => {
  await handleMessage({ message: "What's the weather like today?", sessionId: "t-nofake" });
  const all = ["WORKING", "EPISODIC", "SEMANTIC", "PROJECT", "PREFERENCE", "LEARNED_PATTERN", "PROVENANCE"].flatMap((cls) =>
    memoryStore.query(cls, (r) => r.user_scope === USER_SCOPE)
  );
  assert.equal(all.length, 0);
});
