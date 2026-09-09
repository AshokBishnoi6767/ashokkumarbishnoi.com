"use strict";

const { MemoryClass } = require("../shared/constants");
const { createMemoryRecord } = require("./types");

// In-memory only for Phase 1 — deliberately, since the Firestore-vs-other
// decision for persistent storage is still open (see prior architecture
// audit). One Map per memory class keeps classes from mixing into a single
// undifferentiated store, matching the same shape a Firestore collection
// per class would take later.
const stores = new Map(Object.values(MemoryClass).map((cls) => [cls, new Map()]));

function remember(memoryClass, fields) {
  if (!stores.has(memoryClass)) {
    throw new TypeError(`Unknown memory class: ${memoryClass}`);
  }
  const record = createMemoryRecord(fields);
  stores.get(memoryClass).set(record.memory_id, record);
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
  for (const map of stores.values()) map.clear();
}

module.exports = { remember, recall, query, _reset };
