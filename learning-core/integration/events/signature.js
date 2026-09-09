"use strict";

const crypto = require("crypto");

// Generic HMAC-SHA256 webhook signature check, timing-safe. Provider
// adapters format their own header (GitHub's is "sha256=<hex>") and pass
// the raw digest portion in here — this module never sees or logs the
// webhook secret beyond using it for the one comparison.
function verifyHmacSha256(rawBody, providedHexDigest, secret) {
  if (!secret || !providedHexDigest) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(providedHexDigest, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { verifyHmacSha256 };
