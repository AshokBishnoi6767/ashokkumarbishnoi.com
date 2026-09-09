"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createInput } = require("../input/schema");

test("input: normalizes a text input with all required fields", () => {
  const input = createInput({ modality: "TEXT", source: "chat", content: "hello" });
  assert.equal(input.modality, "TEXT");
  assert.equal(input.processing_status, "RECEIVED");
  assert.ok(input.input_id);
  assert.ok(input.timestamp);
  assert.ok(input.provenance.origin === "chat");
});

test("input: rejects malformed input (unknown modality)", () => {
  assert.throws(() => createInput({ modality: "HOLOGRAM", source: "chat" }), TypeError);
});

test("input: rejects missing required field (source)", () => {
  assert.throws(() => createInput({ modality: "TEXT" }), TypeError);
});

test("input: identifies modality distinctly per input", () => {
  const textInput = createInput({ modality: "TEXT", source: "chat", content: "hi" });
  const imageInput = createInput({ modality: "IMAGE", source: "upload", originalReference: "gs://bucket/img.png" });
  assert.equal(textInput.modality, "TEXT");
  assert.equal(imageInput.modality, "IMAGE");
  assert.notEqual(textInput.input_id, imageInput.input_id);
});
