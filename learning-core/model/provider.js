"use strict";

// Contract every model provider (OpenAI/Claude/Gemini/...) must satisfy.
// Nothing above this line may depend on a specific provider's SDK/API shape.
const REQUIRED_METHODS = ["capabilities", "invoke", "health"];

function assertProviderShape(provider) {
  for (const method of REQUIRED_METHODS) {
    if (typeof provider[method] !== "function") {
      throw new Error(`Model provider missing required method: ${method}`);
    }
  }
}

module.exports = { assertProviderShape };
