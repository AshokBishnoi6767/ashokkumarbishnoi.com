"use strict";

// Durable JSON-file persistence adapter behind a tiny load/save contract.
// Every store in this tree (conversations, memory, audit, approvals) sits
// on top of this instead of talking to fs directly, so a later swap to
// Firestore touches only this one module.
//
// Zero new dependencies (Node's fs/os/path only) and no credentials — this
// is exactly the kind of local, disk-based durability the milestone asked
// for without introducing infrastructure the project doesn't already need.
//
// PRODUCTION RUNTIME BOUNDARY (verified against the real Firebase Functions
// gen2 emulator this session, not assumed): this adapter is correct for
// the single long-running `node server/index.js` process this product runs
// as day to day. It is NOT correct for a real serverless deployment
// (functions-entry.js / Cloud Functions gen2 / Cloud Run) — separate
// instances of the same function do not share a filesystem, and the
// writable area outside /tmp is not guaranteed to persist between cold
// starts. Deploying functions-entry.js for real production traffic without
// first replacing this adapter's backend with Firestore (the fit every
// comment in this tree has been anticipating) would silently produce
// per-instance, non-durable "persistence" — worse than being obviously
// absent, because it would look like it worked in a single-instance test.
// That migration is a real infrastructure decision (provisioning a
// Firestore database) and was deliberately left for explicit authorization
// rather than made silently.
const fs = require("fs");
const os = require("os");
const path = require("path");

let _testDir = null;

// Test isolation: when NODE_ENV=test and no explicit override is given,
// every store gets a fresh temp directory unique to this process — so
// running the test suite can never read or overwrite real conversation/
// memory/audit data on disk. LEARNING_CORE_DATA_DIR always wins when set,
// which is how the restart-survival test points two separate child
// processes at the same directory on purpose.
function resolveDataDir() {
  if (process.env.LEARNING_CORE_DATA_DIR) {
    return path.resolve(process.env.LEARNING_CORE_DATA_DIR);
  }
  if (process.env.NODE_ENV === "test") {
    if (!_testDir) {
      _testDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-core-test-"));
    }
    return _testDir;
  }
  return path.join(__dirname, "..", ".data");
}

function filePathFor(collection) {
  return path.join(resolveDataDir(), collection + ".json");
}

// Never throws: a missing or corrupt file is treated as "nothing persisted
// yet", not a startup failure.
function load(collection, fallback) {
  try {
    const raw = fs.readFileSync(filePathFor(collection), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

// Atomic write: write to a sibling temp file, then rename over the target.
// rename() is atomic on the same filesystem, so a crash mid-write can never
// leave a half-written/corrupt collection file behind.
function save(collection, data) {
  const dataDir = resolveDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const target = filePathFor(collection);
  const tmp = target + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, target);
}

module.exports = { load, save, resolveDataDir };
