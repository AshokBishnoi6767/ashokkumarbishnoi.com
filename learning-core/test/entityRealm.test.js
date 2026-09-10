"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { EntityType, extractEntityMentions, groupMentionsByCandidateIdentity } = require("../language/realm/entityRealm");
const { tokenize } = require("../language/realm/tokenRealm");

function extract(text, opts) {
  const { tokens } = tokenize(text);
  return extractEntityMentions(text, tokens, opts);
}

test("Entity realm: rejects non-string text or non-array tokens", () => {
  assert.deepEqual(extractEntityMentions(null, []), []);
  assert.deepEqual(extractEntityMentions("hi", null), []);
});

test("Entity realm: 'Dog bites man.' — ordinary common nouns are NOT treated as named entities", () => {
  const mentions = extract("Dog bites man.");
  assert.deepEqual(mentions, []);
});

test("Entity realm: 'John works at Google in Toronto.' — PERSON/ORGANIZATION/LOCATION with correct spans", () => {
  const mentions = extract("John works at Google in Toronto.");
  assert.equal(mentions.length, 3);

  const [john, google, toronto] = mentions;
  assert.equal(john.surface, "John");
  assert.equal(john.type, EntityType.PERSON);
  assert.equal(john.span.tokenStart, 0);
  assert.equal(john.span.tokenEnd, 1);

  assert.equal(google.surface, "Google");
  assert.equal(google.type, EntityType.ORGANIZATION);
  assert.equal(google.span.tokenStart, 3);
  assert.equal(google.span.tokenEnd, 4);

  assert.equal(toronto.surface, "Toronto");
  assert.equal(toronto.type, EntityType.LOCATION);
  assert.equal(toronto.span.tokenStart, 5);
  assert.equal(toronto.span.tokenEnd, 6);
});

test("Entity realm: 'Google works with John in Toronto.' — same entities, spans reflect the new sentence, not reused from another sentence", () => {
  const mentions = extract("Google works with John in Toronto.");
  assert.equal(mentions.length, 3);

  const [google, john, toronto] = mentions;
  assert.equal(google.type, EntityType.ORGANIZATION);
  assert.equal(google.span.tokenStart, 0);

  assert.equal(john.type, EntityType.PERSON);
  assert.equal(john.span.tokenStart, 3);

  assert.equal(toronto.type, EntityType.LOCATION);
  assert.equal(toronto.span.tokenStart, 5);
});

test("Entity realm: multi-token LOCATION — 'New York is big.'", () => {
  const mentions = extract("New York is big.");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].surface, "New York");
  assert.equal(mentions[0].normalized, "new york");
  assert.equal(mentions[0].type, EntityType.LOCATION);
  assert.equal(mentions[0].span.tokenStart, 0);
  assert.equal(mentions[0].span.tokenEnd, 2);
});

test("Entity realm: multi-token ORGANIZATION via structural suffix — 'Acme Corp hired John.' (no lookup needed for 'Acme')", () => {
  const mentions = extract("Acme Corp hired John.");
  assert.equal(mentions.length, 2);
  assert.equal(mentions[0].surface, "Acme Corp");
  assert.equal(mentions[0].type, EntityType.ORGANIZATION);
  assert.equal(mentions[1].surface, "John");
  assert.equal(mentions[1].type, EntityType.PERSON);
});

test("Entity realm: a capitalized proper-noun-shaped word with no seed/suffix match still yields a mention, typed generically (never invented as PERSON/ORG/LOCATION)", () => {
  const mentions = extract("Zorblax visited the office.");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].surface, "Zorblax");
  assert.equal(mentions[0].type, EntityType.ENTITY);
  assert.equal(mentions[0].source, "STRUCTURAL_PROPER_NOUN");
});

test("Entity realm: NUMBER — 'The team has 42 members.'", () => {
  const mentions = extract("The team has 42 members.");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].type, EntityType.NUMBER);
  assert.equal(mentions[0].surface, "42");
  assert.equal(mentions[0].attributes.value, 42);
});

test("Entity realm: TIME merges a NUMBER token with an adjacent am/pm token — 'The event is at 3 PM.'", () => {
  const mentions = extract("The event is at 3 PM.");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].type, EntityType.TIME);
  assert.equal(mentions[0].surface, "3 PM");
  assert.equal(mentions[0].attributes.resolved, true);
  assert.equal(mentions[0].attributes.time_24h, "15:00");
});

test("Entity realm: an unresolvable time-of-day expression is reported UNKNOWN, never guessed — 'The call is at 13 PM.'", () => {
  const mentions = extract("The call is at 13 PM.");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].type, EntityType.UNKNOWN);
  assert.equal(mentions[0].attributes.resolved, false);
  assert.ok(mentions[0].attributes.reason);
});

test("Entity realm: DATE via reused temporal/resolve.js — 'The trip is tomorrow.'", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const mentions = extract("The trip is tomorrow.", { now, timezone: "UTC" });
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].type, EntityType.DATE);
  assert.equal(mentions[0].surface, "tomorrow");
  assert.equal(mentions[0].attributes.resolved, true);
  assert.equal(mentions[0].attributes.resolved_date, "2026-09-11");
});

test("Entity realm: a plain number is not misread as a date/time when there is no am/pm cue", () => {
  const mentions = extract("There were 15 people.");
  const numberMentions = mentions.filter((m) => m.type === EntityType.NUMBER);
  assert.equal(numberMentions.length, 1);
  assert.equal(numberMentions[0].surface, "15");
});

test("Entity realm: mentions vs. identity — two mentions of 'John' are separate mention objects, not silently merged", () => {
  const mentions = extract("John met John.");
  assert.equal(mentions.length, 2);
  assert.notEqual(mentions[0].id, mentions[1].id);
  assert.equal(mentions[0].normalized, "john");
  assert.equal(mentions[1].normalized, "john");
});

test("Entity realm: groupMentionsByCandidateIdentity clusters by surface+type only, and is explicitly distinct from mention identity", () => {
  const mentions = extract("John met John.");
  const groups = groupMentionsByCandidateIdentity(mentions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].normalized, "john");
  assert.equal(groups[0].type, EntityType.PERSON);
  assert.equal(groups[0].mentionIds.length, 2);
  // The candidate group's own id is distinct from either mention's id —
  // grouping introduces a new, separate object, not an alias.
  assert.notEqual(groups[0].candidateId, mentions[0].id);
  assert.notEqual(groups[0].candidateId, mentions[1].id);
});

test("Entity realm: groupMentionsByCandidateIdentity keeps different entities in different groups", () => {
  const mentions = extract("John works at Google in Toronto.");
  const groups = groupMentionsByCandidateIdentity(mentions);
  assert.equal(groups.length, 3);
});
