"use strict";

// Proves persistence survives an actual process restart, not just a
// same-process re-read of a Map that was never gone. Each phase below runs
// in its OWN child `node` process — a fresh require cache, fresh module
// state, nothing carried over except what's on disk — pointed at the same
// LEARNING_CORE_DATA_DIR. If data disappears after "restart", this fails.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CORE_ROOT = path.join(__dirname, "..");

function runInChildProcess(dataDir, script) {
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: CORE_ROOT,
    env: { ...process.env, LEARNING_CORE_DATA_DIR: dataDir, NODE_ENV: "" },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`child process failed (exit ${result.status}):\n${result.stderr}`);
  }
  return result.stdout.trim();
}

test("persistence: a conversation written by one process is readable by a separate later process (real restart)", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "restart-test-conv-"));

  runInChildProcess(
    dataDir,
    `
      const { appendMessage } = require("./persistence/store");
      appendMessage("restart-session-1", "public:visitor", { role: "user", content: "Hello before restart." });
    `
  );

  const output = runInChildProcess(
    dataDir,
    `
      const { getConversation } = require("./persistence/store");
      const record = getConversation("restart-session-1", "public:visitor");
      process.stdout.write(JSON.stringify(record));
    `
  );

  const record = JSON.parse(output);
  assert.equal(record.messages.length, 1);
  assert.equal(record.messages[0].content, "Hello before restart.");
});

test("persistence: a memory record written by one process is readable by a separate later process (real restart)", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "restart-test-mem-"));

  runInChildProcess(
    dataDir,
    `
      const { remember } = require("./memory/store");
      remember("SEMANTIC", { type: "SEMANTIC", content: "Ashok prefers concise updates.", source: "conversation", sourceReference: "test", userScope: "private:ashok" });
    `
  );

  const output = runInChildProcess(
    dataDir,
    `
      const { query } = require("./memory/store");
      const records = query("SEMANTIC", () => true);
      process.stdout.write(JSON.stringify(records));
    `
  );

  const records = JSON.parse(output);
  assert.equal(records.length, 1);
  assert.equal(records[0].content, "Ashok prefers concise updates.");
});

test("persistence: an audit record written by one process is readable by a separate later process (real restart)", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "restart-test-audit-"));

  runInChildProcess(
    dataDir,
    `
      const { recordAudit } = require("./integration/audit/log");
      recordAudit({ action_id: "action-restart-1", who: "ashok", why: "test", when: new Date().toISOString(), tool: "mock", capability: "test.capability", action_status: "COMPLETED", result: "SUCCESS", verified: true });
    `
  );

  const output = runInChildProcess(
    dataDir,
    `
      const { listAudit } = require("./integration/audit/log");
      process.stdout.write(JSON.stringify(listAudit()));
    `
  );

  const entries = JSON.parse(output);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action_id, "action-restart-1");
  assert.equal(entries[0].result, "SUCCESS");
});

test("persistence: data files actually exist on disk under the configured data directory (not just an in-memory illusion)", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "restart-test-diskcheck-"));

  runInChildProcess(
    dataDir,
    `
      const { appendMessage } = require("./persistence/store");
      appendMessage("disk-check-session", "public:visitor", { role: "user", content: "On disk." });
    `
  );

  const filePath = path.join(dataDir, "conversations.json");
  assert.ok(fs.existsSync(filePath), "conversations.json was not written to disk");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(raw.length, 1);
  assert.equal(raw[0].session_id, "disk-check-session");
});
