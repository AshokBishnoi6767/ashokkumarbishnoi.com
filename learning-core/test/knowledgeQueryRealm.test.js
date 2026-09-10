"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  queryKnowledge,
  getKnowledgeById,
  indexKnowledgeBySubject,
  indexKnowledgeByObject,
  indexKnowledgeByPredicate,
} = require("../language/realm/knowledgeQueryRealm");
const { extractKnowledge } = require("../language/realm/knowledgeRealm");
const { tokenize } = require("../language/realm/tokenRealm");
const { EntityType } = require("../language/realm/entityRealm");
const { TruthState } = require("../shared/constants");

function knowledgeFor(text, opts) {
  const { tokens } = tokenize(text);
  return extractKnowledge(text, tokens, opts).records;
}

test("queryKnowledge: rejects a non-array input", () => {
  assert.throws(() => queryKnowledge(null), TypeError);
  assert.throws(() => queryKnowledge("nope"), TypeError);
});

test("queryKnowledge: no criteria returns every record, unchanged order", () => {
  const records = knowledgeFor("John works at Google in Toronto.");
  const result = queryKnowledge(records);
  assert.deepEqual(result, records);
});

test("queryKnowledge: filters by exact predicate", () => {
  const records = knowledgeFor("John works at Google in Toronto.");
  const result = queryKnowledge(records, { predicate: "WORKS_IN" });
  assert.equal(result.length, 1);
  assert.equal(result[0].object.surface, "Toronto");
});

test("queryKnowledge: filters by subjectId (exact entity identity, not surface)", () => {
  const records = knowledgeFor("John works at Google in Toronto.");
  const johnId = records[0].subject.id;
  const result = queryKnowledge(records, { subjectId: johnId });
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.subject.id === johnId));
});

test("queryKnowledge: subjectId distinguishes two same-surface-form mentions that are not the same identity", () => {
  const records = knowledgeFor("John chased John.");
  const [record] = records;
  const bySubject = queryKnowledge(records, { subjectId: record.subject.id });
  const byObject = queryKnowledge(records, { subjectId: record.object.id });
  assert.equal(bySubject.length, 1);
  assert.equal(byObject.length, 0); // the object mention's id was never used as a subject
});

test("queryKnowledge: filters by surface form, case-insensitively", () => {
  const records = knowledgeFor("John works at Google.");
  const result = queryKnowledge(records, { subjectSurface: "john" });
  assert.equal(result.length, 1);
  assert.equal(queryKnowledge(records, { subjectSurface: "Mary" }).length, 0);
});

test("queryKnowledge: filters by entity type on subject and object independently", () => {
  const records = knowledgeFor("John works at Google.");
  assert.equal(queryKnowledge(records, { subjectType: EntityType.PERSON }).length, 1);
  assert.equal(queryKnowledge(records, { objectType: EntityType.ORGANIZATION }).length, 1);
  assert.equal(queryKnowledge(records, { subjectType: EntityType.ORGANIZATION }).length, 0);
});

test("queryKnowledge: filters by truth_state", () => {
  const records = knowledgeFor("John works at Google.");
  assert.equal(queryKnowledge(records, { truthState: TruthState.UNKNOWN }).length, 1);
  assert.equal(queryKnowledge(records, { truthState: TruthState.VERIFIED }).length, 0);
});

test("queryKnowledge: combines multiple criteria with AND semantics", () => {
  const records = knowledgeFor("John works at Google in Toronto.");
  const result = queryKnowledge(records, { subjectSurface: "john", predicate: "WORKS_AT" });
  assert.equal(result.length, 1);
  assert.equal(result[0].object.surface, "Google");
});

test("queryKnowledge: no matches returns an empty array, never null/undefined", () => {
  const records = knowledgeFor("John works at Google.");
  const result = queryKnowledge(records, { predicate: "DOES_NOT_EXIST" });
  assert.deepEqual(result, []);
});

test("queryKnowledge: does not mutate the array it is given", () => {
  const records = knowledgeFor("John works at Google in Toronto.");
  const snapshot = [...records];
  queryKnowledge(records, { predicate: "WORKS_AT" });
  assert.deepEqual(records, snapshot);
  assert.equal(records.length, snapshot.length);
});

test("Contradictory/duplicate records: a matching query returns both, never merged", () => {
  const claim = knowledgeFor("Dog bites man.")[0];
  const restated = knowledgeFor("Dog bites man.")[0]; // separately extracted, same predicate/subject/object
  const combined = [claim, restated];
  const result = queryKnowledge(combined, { predicate: "BITES" });
  assert.equal(result.length, 2);
  assert.notEqual(result[0].id, result[1].id);
});

test("getKnowledgeById: finds an exact record by id", () => {
  const records = knowledgeFor("John works at Google.");
  const found = getKnowledgeById(records, records[0].id);
  assert.equal(found, records[0]);
});

test("getKnowledgeById: returns null (not undefined, not a throw) for an unknown id", () => {
  const records = knowledgeFor("John works at Google.");
  assert.equal(getKnowledgeById(records, "know-does-not-exist"), null);
});

test("indexKnowledgeBySubject: groups records by subject entity id without merging them", () => {
  const records = knowledgeFor("John works at Google in Toronto.");
  const index = indexKnowledgeBySubject(records);
  const johnId = records[0].subject.id;
  assert.equal(index.get(johnId).length, 2);
  assert.notEqual(index.get(johnId)[0].id, index.get(johnId)[1].id);
});

test("indexKnowledgeByPredicate: groups by predicate string", () => {
  const records = [...knowledgeFor("Dog bites man."), ...knowledgeFor("Man bites dog.")];
  const index = indexKnowledgeByPredicate(records);
  assert.equal(index.get("BITES").length, 2);
});

test("indexKnowledgeByObject: groups by object entity id", () => {
  const records = knowledgeFor("John works at Google in Toronto.");
  const index = indexKnowledgeByObject(records);
  const googleId = records[0].object.id;
  assert.equal(index.get(googleId).length, 1);
});

test("Determinism: identical input and identical criteria yield structurally identical query results", () => {
  const recordsA = knowledgeFor("John works at Google in Toronto.");
  const recordsB = knowledgeFor("John works at Google in Toronto.");
  const resultA = queryKnowledge(recordsA, { predicate: "WORKS_AT" });
  const resultB = queryKnowledge(recordsB, { predicate: "WORKS_AT" });
  assert.equal(resultA.length, resultB.length);
  assert.equal(resultA[0].subject.surface, resultB[0].subject.surface);
  assert.equal(resultA[0].predicate, resultB[0].predicate);
  assert.equal(resultA[0].object.surface, resultB[0].object.surface);
  assert.notEqual(resultA[0].id, resultB[0].id);
});
