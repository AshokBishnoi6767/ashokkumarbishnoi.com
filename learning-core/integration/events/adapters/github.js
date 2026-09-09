"use strict";

const { verifyHmacSha256 } = require("../signature");

// Confirmed live (docs.github.com, this session): the signature header is
// `X-Hub-Signature-256: sha256=<hex>`. The delivery-id and event-type
// headers (`X-GitHub-Delivery`, `X-GitHub-Event`) are long-standing,
// well-documented GitHub webhook headers but were not independently
// re-fetched this session — treat their exact casing/behavior as
// general-knowledge, not doc-verified, until confirmed.
function toNormalizedEvent({ headers, rawBody, secret }) {
  const signatureHeader = headers["x-hub-signature-256"] || "";
  const providedHexDigest = signatureHeader.startsWith("sha256=") ? signatureHeader.slice("sha256=".length) : null;
  const signatureVerified = verifyHmacSha256(rawBody, providedHexDigest, secret);

  const deliveryId = headers["x-github-delivery"];
  const eventType = headers["x-github-event"];

  if (!deliveryId || !eventType) {
    return { processing_status: "REJECTED", reason: "Missing X-GitHub-Delivery or X-GitHub-Event header." };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return { processing_status: "REJECTED", reason: "Malformed JSON payload." };
  }

  return {
    event_id: deliveryId,
    provider: "github",
    normalized_type: "github." + eventType,
    occurred_at: new Date().toISOString(),
    signature_verified: signatureVerified,
    payload,
  };
}

module.exports = { toNormalizedEvent };
