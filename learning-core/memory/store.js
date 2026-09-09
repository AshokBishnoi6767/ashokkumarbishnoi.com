"use strict";

const { MemoryClass } = require("../shared/constants");
const { createMemoryRecord } = require("./types");
const fileStore = require("../persistence/fileStore");

// One JSON collection per memory class, matching the shape a Firestore
// collection per class would take later. Each class's Map is a read cache
// populated from disk at load time; fileStore is the source of truth, so
// records survive a process restart instead of living only for the current
// process's lifetime.
const COLLECTION_PREFIX = "memory_";

function loadClass(memoryClass) {
  const raw = fileStore.load(COLLECTION_PREFIX + memoryClass, []);
  return new Map(raw.map((record) => [record.memory_id, record]));
}

const stores = new Map(Object.values(MemoryClass).map((cls) => [cls, loadClass(cls)]));

function persist(memoryClass) {
  fileStore.save(COLLECTION_PREFIX + memoryClass, Array.from(stores.get(memoryClass).values()));
}

function remember(memoryClass, fields) {
  if (!stores.has(memoryClass)) {
    throw new TypeError(`Unknown memory class: ${memoryClass}`);
  }
  const record = createMemoryRecord(fields);
  stores.get(memoryClass).set(record.memory_id, record);
  persist(memoryClass);
  return record;
}

function recall(memoryClass, memoryId) {
  if (!stores.has(memoryClass)) {
    throw new TypeError(`Unknown memory class: ${memoryClass}`);
  }
  return stores.get(memoryClass).get(memoryId) || null;
}

function query(memoryClass, predicate = () => true) {
  if (!stores.has(memoryClass)) {
    throw new TypeError(`Unknown memory class: ${memoryClass}`);
  }
  return Array.from(stores.get(memoryClass).values()).filter(predicate);
}

function _reset() {
  for (const [memoryClass, map] of stores.entries()) {
    map.clear();
    persist(memoryClass);
  }
}

module.exports = { remember, recall, query, _reset };
