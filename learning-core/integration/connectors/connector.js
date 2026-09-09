"use strict";

// Every connector (mock or real) must satisfy this shape. Nothing above
// this line — the lifecycle, registries, router — may depend on a
// provider's actual API shape.
const REQUIRED_METHODS = [
  "connect",
  "disconnect",
  "authenticate",
  "getCapabilities",
  "execute",
  "verify",
  "normalizeResult",
  "healthCheck",
  "handleEvent",
];

function assertConnectorShape(connector) {
  for (const method of REQUIRED_METHODS) {
    if (typeof connector[method] !== "function") {
      throw new Error(`Connector missing required method: ${method}`);
    }
  }
}

module.exports = { assertConnectorShape, REQUIRED_METHODS };
