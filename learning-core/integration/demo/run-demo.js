"use strict";

const { listTools } = require("../registry/tools");
const { listCapabilities } = require("../registry/capabilities");
const { listProviders } = require("../registry/providers");
const { runAction } = require("../actions/lifecycle");
const { routeEvent } = require("../events/router");
const { listAudit } = require("../audit/log");
const { integrationHealth } = require("../health");

function section(title) {
  console.log("\n=== " + title + " ===");
}

async function main() {
  section("Provider Registry");
  console.log(listProviders());

  section("Tool Registry");
  console.log(listTools());

  section("Capability Registry");
  console.log(listCapabilities());

  section("1. mock.ping — read-only, no confirmation needed");
  console.log(await runAction({ capabilityId: "mock.ping", params: { hello: "world" }, requestedBy: "demo-user", why: "prove liveness" }));

  section("2. mock.create_record WITHOUT confirmation — must NOT execute");
  console.log(await runAction({ capabilityId: "mock.create_record", params: { name: "Acme Co" }, requestedBy: "demo-user", why: "test unconfirmed write" }));

  section("3. mock.create_record WITH confirmation — should execute and verify");
  console.log(await runAction({ capabilityId: "mock.create_record", params: { name: "Acme Co" }, requestedBy: "demo-user", why: "test confirmed write", confirmed: true }));

  section("4. github.get_repository — real connector, but no credential configured");
  console.log(await runAction({ capabilityId: "github.get_repository", params: { owner: "octocat", repo: "hello-world" }, requestedBy: "demo-user", why: "test credential boundary" }));

  section("5. calendly.get_availability — capability status UNKNOWN, must not execute");
  console.log(await runAction({ capabilityId: "calendly.get_availability", params: { event_type: "intro-call" }, requestedBy: "demo-user", why: "test unverified capability" }));

  section("6. nonexistent.capability — must never be hallucinated as available");
  console.log(await runAction({ capabilityId: "nonexistent.capability", params: {}, requestedBy: "demo-user", why: "test unknown capability" }));

  section("Event Router: normal, duplicate, malformed, spoofed signature");
  console.log(routeEvent({ event_id: "evt-1", provider: "mock", normalized_type: "mock.pinged", occurred_at: new Date().toISOString() }));
  console.log(routeEvent({ event_id: "evt-1", provider: "mock", normalized_type: "mock.pinged", occurred_at: new Date().toISOString() }));
  console.log(routeEvent({ provider: "mock", normalized_type: "mock.pinged" }));
  console.log(routeEvent({ event_id: "evt-2", provider: "github", normalized_type: "github.push", occurred_at: new Date().toISOString(), signature_verified: false }));

  section("Audit Trail");
  console.log(listAudit());

  section("Integration Health");
  console.log(integrationHealth());
}

main();
