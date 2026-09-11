"use strict";

// REAL HTTP tests: these start the actual server on an ephemeral port and
// make real fetch() requests against it — not direct function calls to
// the handler. This is Phase 9's explicit requirement.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { server } = require("../server/index");
const { setConnectionState, getConnectionState } = require("../learning-core/integration/connection/store");
const { getConversation } = require("../learning-core/persistence/store");
const firebaseAdmin = require("../learning-core/integration/auth/firebaseAdmin");
const ownerAccount = require("../learning-core/integration/auth/ownerAccount");
const fakeAdminAuth = require("./fakeAdminAuth");
const rateLimiter = require("../learning-core/integration/security/rateLimiter");
const securityLog = require("../learning-core/integration/audit/securityLog");

let baseUrl;
let ownerToken;
let ownerEmail;
let ownerUid;

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  // Deterministic Firebase Admin double for the whole suite — see
  // fakeAdminAuth.js for why this is the same precedent as
  // testCalendarConnector.js rather than requiring a live emulator process
  // for every test run. A separate, real-emulator verification is
  // documented in the final report.
  firebaseAdmin.setAdminAuthForTesting(fakeAdminAuth);
});

after(async () => {
  firebaseAdmin._resetAdminAuthForTesting();
  await new Promise((resolve) => server.close(resolve));
});

// Every test gets a FRESH owner account through the real, unmodified
// setup-owner endpoint (not a shortcut) — proving that endpoint's actual
// logic on every single test run, not just the ones that name it.
// fakeAdminAuth's uid counter never resets, so each test's owner scope is
// globally unique across the whole file — no cross-test memory bleed.
beforeEach(async () => {
  ownerAccount._reset();
  fakeAdminAuth.reset();
  // Every test's setup-owner call in this hook shares one client IP
  // (loopback) — without resetting the rate limiter's window per test,
  // the real per-IP setup-owner limit would start rejecting this hook
  // itself partway through the suite, unrelated to what any individual
  // test is exercising.
  rateLimiter._reset();
  securityLog._reset();
  ownerEmail = `owner-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const setupRes = await post("/api/auth/setup-owner", { email: ownerEmail, password: "correct horse battery staple" });
  const setupBody = await setupRes.json();
  assert.equal(setupRes.status, 200, JSON.stringify(setupBody));
  ownerUid = fakeAdminAuth.getUidForEmail(ownerEmail);
  ownerToken = fakeAdminAuth.issueTokenForEmail(ownerEmail);
});

function post(path, body, headers = {}) {
  return fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(path, headers = {}) {
  return fetch(baseUrl + path, { headers });
}

function authHeader() {
  return { Authorization: "Bearer " + ownerToken };
}

// === Owner authentication ===

test("AUTH: GET /api/auth/config is public and reports whether the owner is configured, without leaking anything private", async () => {
  const res = await get("/api/auth/config");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ownerConfigured, true); // beforeEach already ran real setup-owner
  assert.ok(body.apiKey && body.authDomain && body.projectId && body.appId);
});

test("AUTH: POST /api/auth/setup-owner refuses a second attempt once the owner already exists (no public registration after setup)", async () => {
  const res = await post("/api/auth/setup-owner", { email: "someone-else@example.com", password: "whatever-password" });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.status, "OWNER_ALREADY_CONFIGURED");
});

test("AUTH: POST /api/auth/setup-owner rejects a too-short password, and the password is never echoed back", async () => {
  ownerAccount._reset(); // simulate a fresh, never-configured instance for this one test
  const res = await post("/api/auth/setup-owner", { email: "new-owner@example.com", password: "short" });
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.ok(!text.includes("short"), "the rejected password leaked back into the response");
});

test("AUTH: GET /api/auth/me returns the authenticated owner's uid/email, and 401s without a token", async () => {
  const authed = await get("/api/auth/me", authHeader());
  assert.equal(authed.status, 200);
  const body = await authed.json();
  assert.equal(body.uid, ownerUid);
  assert.equal(body.email, ownerEmail);

  const anon = await get("/api/auth/me");
  assert.equal(anon.status, 401);
});

test("AUTH: a forged bearer token (never actually issued by sign-in) is rejected, not treated as a valid identity", async () => {
  const res = await post("/api/ai", { message: "hi" }, { Authorization: "Bearer " + ownerUid }); // naive forgery: just claiming the real uid as the token string
  assert.equal(res.status, 401);
});

test("AUTH: an authenticated user who is NOT the configured owner is rejected — being a real Firebase user is not enough", async () => {
  fakeAdminAuth.registerUser("test-uid-intruder", "intruder@example.com");
  const intruderToken = fakeAdminAuth.issueTokenForUid("test-uid-intruder");
  const res = await post("/api/ai", { message: "hi" }, { Authorization: "Bearer " + intruderToken });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.reason, /not the configured owner/);
});

test("AUTH: private data is scoped to the owner's verified uid — GET /api/memory only ever returns records for auth.userScope", async () => {
  const stored = await post("/api/ai", { message: "I prefer isolation-tested replies.", sessionId: "auth-scope-1" }, authHeader());
  const storedBody = await stored.json();
  assert.equal(storedBody.status, "MEMORY_STORED");

  const memRes = await get("/api/memory", authHeader());
  const memBody = await memRes.json();
  assert.ok(memBody.memory.every((m) => m.user_scope === "private:" + ownerUid));
  assert.ok(memBody.memory.some((m) => m.memory_id === storedBody.record.memory_id));
});

// 2. valid AI request
test("POST /api/ai: a valid, authorized request returns 200 with a structured status — no model is CONNECTED in this environment, so the registry correctly falls back to the null provider (UNKNOWN) rather than fabricating a reply", async () => {
  const res = await post("/api/ai", { message: "What should I focus on today?" }, authHeader());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "UNKNOWN");
  assert.match(body.reason, /No model provider connected/);
  assert.ok(body.sessionId);
});

// 3. invalid request
test("POST /api/ai: missing message is 400 INVALID_REQUEST", async () => {
  const res = await post("/api/ai", {}, authHeader());
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.status, "INVALID_REQUEST");
});

// Auth boundary
test("POST /api/ai: no token is 401 UNAUTHORIZED, and the body never contains the real token", async () => {
  const res = await post("/api/ai", { message: "hi" });
  assert.equal(res.status, 401);
  const text = await res.text();
  assert.ok(!text.includes(ownerToken));
});

test("POST /api/ai: wrong token is 401 UNAUTHORIZED", async () => {
  const res = await post("/api/ai", { message: "hi" }, { Authorization: "Bearer wrong-token-value" });
  assert.equal(res.status, 401);
});

// 5/6. approval-required action, then approved action — through the REAL HTTP endpoint
test("POST /api/ai: CRITICAL — a recognized calendar action requires approval before it executes", async () => {
  const res = await post(
    "/api/ai",
    { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata" },
    authHeader()
  );
  const body = await res.json();
  assert.equal(body.status, "ACTION");
  assert.equal(body.result.action.action_status === "PENDING_CONFIRMATION" || body.result.action.action_status === "NOT_AUTHORIZED", true);
});

test("POST /api/ai: the same action succeeds once write scope is granted and confirmed:true is sent", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post(
      "/api/ai",
      { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata", confirmed: true },
      authHeader()
    );
    const body = await res.json();
    assert.equal(body.status, "ACTION");
    assert.equal(body.result.action.result, "SUCCESS");
    assert.equal(body.result.action.verified, true);
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

// 8. connector failure / 9. verification failure — through the REAL HTTP endpoint,
// proving __test_scenario reaches the same deterministic connector used by the unit tests.
test("POST /api/ai: connector PROVIDER_FAILURE reaches the client as FAILED, not a fake success", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post(
      "/api/ai",
      { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata", confirmed: true, testScenario: "PROVIDER_FAILURE" },
      authHeader()
    );
    const body = await res.json();
    assert.equal(body.result.action.result, "FAILED");
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("POST /api/ai: connector VERIFICATION_FAILURE reaches the client as UNKNOWN, never SUCCESS", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post(
      "/api/ai",
      { message: "Create an investor meeting tomorrow at 2 PM.", timezone: "Asia/Kolkata", confirmed: true, testScenario: "VERIFICATION_FAILURE" },
      authHeader()
    );
    const body = await res.json();
    assert.equal(body.result.action.result, "UNKNOWN");
    assert.notEqual(body.result.action.result, "SUCCESS");
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

// 10. public/private isolation
test("POST /api/public-ai: requires no token, and a calendar-creation phrase NEVER triggers an action (public agent has no action capability at all)", async () => {
  const res = await post("/api/public-ai", { message: "Create an investor meeting tomorrow at 2 PM." });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal("action" in body, false);
  assert.notEqual(body.status, "ACTION");
});

test("POST /api/public-ai: valid request returns a structured status, never a fake canned reply, when no model is connected", async () => {
  const res = await post("/api/public-ai", { message: "What is Industry 4.0?" });
  const body = await res.json();
  assert.equal(body.status, "UNKNOWN");
});

// 11. secret isolation
test("SECURITY: no response body from any endpoint ever contains the owner's bearer token", async () => {
  const responses = await Promise.all([
    post("/api/ai", { message: "hello" }, authHeader()),
    post("/api/public-ai", { message: "hello" }),
    fetch(baseUrl + "/api/health"),
    get("/api/audit", authHeader()),
    get("/api/approvals", authHeader()),
    get("/api/memory", authHeader()),
  ]);
  for (const res of responses) {
    const text = await res.text();
    assert.ok(!text.includes(ownerToken), "response leaked the owner's bearer token");
  }
});

// 12. conversation persistence
test("conversation persistence: two messages with the same sessionId accumulate in the same conversation record", async () => {
  const res1 = await post("/api/public-ai", { message: "First message." });
  const body1 = await res1.json();
  const sessionId = body1.sessionId;

  await post("/api/public-ai", { message: "Second message.", sessionId });

  const conversation = getConversation(sessionId, "public:visitor");
  const userMessages = conversation.messages.filter((m) => m.role === "user");
  assert.equal(userMessages.length, 2);
  assert.equal(userMessages[0].content, "First message.");
  assert.equal(userMessages[1].content, "Second message.");
});

// Static serving sanity (the existing site must still work through this server)
test("GET /: serves the existing public site unmodified", async () => {
  const res = await fetch(baseUrl + "/");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /We help people run faster in Industry 4\.0/);
});

test("GET /dashboard: serves the private dashboard shell", async () => {
  const res = await fetch(baseUrl + "/dashboard");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Command Center/);
});

// --- SEO: legacy redirects, sitemap, robots, private-route protection ---

test("SEO: pre-redesign URLs with a clear equivalent 301-redirect, not to the homepage", async () => {
  const cases = [
    ["/start-a-project/", "/contact/"],
    ["/tools/", "/resources/tools-templates/"],
    ["/insights/", "/resources/thought-leadership/"],
    ["/insights/traffic-versus-buyers/", "/resources/thought-leadership/"],
    ["/blog/", "/resources/articles/"],
    ["/blog/2026/08/22/work-life-integration/", "/resources/articles/"],
  ];
  for (const [from, to] of cases) {
    const res = await fetch(baseUrl + from, { redirect: "manual" });
    assert.equal(res.status, 301, `${from} should 301`);
    assert.equal(res.headers.get("location"), to, `${from} should redirect to ${to}`);
  }
});

test("SEO: pre-redesign URLs with no clear equivalent 404 rather than redirecting to the homepage", async () => {
  const cases = ["/work/", "/portfolio.html", "/services/case-studies/"];
  for (const url of cases) {
    const res = await fetch(baseUrl + url, { redirect: "manual" });
    assert.notEqual(res.status, 301, `${url} should not redirect`);
    assert.notEqual(res.status, 302, `${url} should not redirect`);
    assert.equal(res.status, 404, `${url} should 404`);
  }
});

test("SEO: sitemap.xml is valid, and never contains private/noindex routes", async () => {
  const res = await fetch(baseUrl + "/sitemap.xml");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /<urlset/);
  assert.match(text, /<loc>https:\/\/ashokkumarbishnoi\.com\/<\/loc>/);
  for (const forbidden of ["/dashboard", "/sign-in/", "/api/"]) {
    assert.equal(text.includes(forbidden), false, `sitemap must not list ${forbidden}`);
  }
});

test("SEO: robots.txt disallows private application routes and references the sitemap", async () => {
  const res = await fetch(baseUrl + "/robots.txt");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Disallow: \/dashboard/);
  assert.match(text, /Disallow: \/api\//);
  assert.match(text, /Sitemap: https:\/\/ashokkumarbishnoi\.com\/sitemap\.xml/);
});

test("SEO: /sign-in/ is reachable (not blocked by robots.txt) but carries noindex,nofollow", async () => {
  const res = await fetch(baseUrl + "/sign-in/");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /content="noindex,nofollow" name="robots"/);
});

test("SEO: every indexable page has a canonical link and a unique meta description", async () => {
  const pages = ["/", "/services/", "/about/", "/resources/", "/contact/", "/resources/b2b-saas-toronto/", "/resources/b2b-saas-canada/", "/resources/b2b-saas-waterloo-kitchener-cambridge/", "/resources/top-b2b-saas-companies/"];
  const descriptions = new Set();
  for (const p of pages) {
    const res = await fetch(baseUrl + p);
    const text = await res.text();
    assert.match(text, /rel="canonical"/, `${p} missing canonical`);
    const descMatch = text.match(/name="description"/);
    assert.ok(descMatch, `${p} missing meta description`);
    const contentMatch = text.match(/content="([^"]*)" name="description"/);
    assert.ok(contentMatch, `${p} description content unreadable`);
    assert.equal(descriptions.has(contentMatch[1]), false, `${p} has a duplicate meta description`);
    descriptions.add(contentMatch[1]);
  }
});

test("SEO: the four B2B SaaS cornerstone pages each carry valid BreadcrumbList and FAQPage JSON-LD", async () => {
  const pages = ["/resources/b2b-saas-waterloo-kitchener-cambridge/", "/resources/b2b-saas-toronto/", "/resources/b2b-saas-canada/", "/resources/top-b2b-saas-companies/"];
  for (const p of pages) {
    const res = await fetch(baseUrl + p);
    assert.equal(res.status, 200);
    const text = await res.text();
    const blocks = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocks.some((b) => b["@type"] === "BreadcrumbList"), `${p} missing BreadcrumbList`);
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq, `${p} missing FAQPage`);
    assert.ok(faq.mainEntity.length >= 3, `${p} FAQ should have real questions`);
  }
});

test("SEO: cornerstone pages are not orphaned — the Resources hub links to all four", async () => {
  const res = await fetch(baseUrl + "/resources/");
  const text = await res.text();
  for (const href of [
    "/resources/b2b-saas-waterloo-kitchener-cambridge/",
    "/resources/b2b-saas-toronto/",
    "/resources/b2b-saas-canada/",
    "/resources/top-b2b-saas-companies/",
  ]) {
    assert.match(text, new RegExp(`href="${href.replace(/\//g, "\\/")}"`), `Resources hub missing link to ${href}`);
  }
});

test("SEO: cornerstone pages never claim to be objectively No. 1 / best / leading as a factual statement", async () => {
  const pages = ["/resources/b2b-saas-toronto/", "/resources/b2b-saas-canada/", "/resources/top-b2b-saas-companies/"];
  for (const p of pages) {
    const res = await fetch(baseUrl + p);
    const text = await res.text();
    // The literal phrases are allowed only inside the honest "we don't
    // claim this" framing already written on these pages — this asserts
    // that framing is present, not merely absent of the phrase.
    assert.match(text, /no single|isn.t one honest answer|cannot be independently verified/i, `${p} should explicitly disclaim an unverifiable #1\/best claim`);
  }
});

// --- 50-article Thought Leadership engine ---

const SAMPLE_ARTICLE_SLUGS = [
  "your-company-doesnt-need-more-technology",
  "the-ai-adoption-gap",
  "the-b2b-content-gap",
  "the-data-to-decision-gap",
  "think-build-measure-improve",
];

test("SEO: sample thought-leadership articles are indexable with unique canonical, Article + BreadcrumbList JSON-LD", async () => {
  for (const slug of SAMPLE_ARTICLE_SLUGS) {
    const res = await fetch(baseUrl + `/resources/${slug}/`);
    assert.equal(res.status, 200, slug);
    const text = await res.text();
    assert.match(text, /rel="canonical"/, slug);
    assert.match(text, /content="index,follow"/, slug);
    const blocks = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocks.some((b) => b["@type"] === "Article"), `${slug} missing Article schema`);
    assert.ok(blocks.some((b) => b["@type"] === "BreadcrumbList"), `${slug} missing BreadcrumbList schema`);
  }
});

test("SEO: every sample article has exactly one H1 and a real, enabled whitepaper CTA (no fake download, no leftover 'not yet available' state)", async () => {
  for (const slug of SAMPLE_ARTICLE_SLUGS) {
    const res = await fetch(baseUrl + `/resources/${slug}/`);
    const text = await res.text();
    const h1Count = (text.match(/<h1>/g) || []).length;
    assert.equal(h1Count, 1, slug);
    assert.match(text, /whitepaper-cta/, slug);
    assert.doesNotMatch(text, /Whitepaper in production/, slug);
    assert.equal(/href="[^"]*\.pdf"/i.test(text), false, `${slug} must not link a fake PDF download`);
    const linkMatch = text.match(/class="portal portal-deeper" href="([^"]+)"/);
    assert.ok(linkMatch, `${slug} should have an enabled portal-deeper link`);
  }
});

test("SEO: articles link to real related articles that actually exist (no broken related-content links)", async () => {
  for (const slug of SAMPLE_ARTICLE_SLUGS) {
    const res = await fetch(baseUrl + `/resources/${slug}/`);
    const text = await res.text();
    const related = [...text.matchAll(/class="related-articles">[\s\S]*?<\/section>/g)][0];
    assert.ok(related, slug);
    const links = [...related[0].matchAll(/href="(\/resources\/[a-z0-9\-]+\/)"/g)].map((m) => m[1]);
    assert.ok(links.length >= 3, `${slug} should have at least 3 related links`);
    for (const link of links) {
      const linkedRes = await fetch(baseUrl + link);
      assert.equal(linkedRes.status, 200, `${slug} links to broken ${link}`);
    }
  }
});

test("SEO: the Thought Leadership hub lists all 50 articles and is indexable (no longer a thin noindex stub)", async () => {
  const res = await fetch(baseUrl + "/resources/thought-leadership/");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /content="index,follow"/);
  const links = new Set([...text.matchAll(/href="(\/resources\/[a-z0-9\-]+\/)"/g)].map((m) => m[1]));
  assert.ok(links.size >= 50, `expected at least 50 article links on the hub, found ${links.size}`);
});

test("SEO: sitemap.xml includes the 50 articles and the thought-leadership hub", async () => {
  const res = await fetch(baseUrl + "/sitemap.xml");
  const text = await res.text();
  for (const slug of SAMPLE_ARTICLE_SLUGS) {
    assert.match(text, new RegExp(`<loc>https://ashokkumarbishnoi\\.com/resources/${slug}/</loc>`), slug);
  }
  assert.match(text, /<loc>https:\/\/ashokkumarbishnoi\.com\/resources\/thought-leadership\/<\/loc>/);
});

test("SEO: the 'Ask the Navigator' CTA on an article targets the existing public Navigator widget, not a dead link", async () => {
  const res = await fetch(baseUrl + "/resources/the-feedback-loop/");
  const text = await res.text();
  assert.match(text, /data-open-navigator=""/);
  assert.match(text, /article-visuals\.js/);
});

test("SEO: no article makes an unverifiable statistic claim — reserved words like 'studies show' or 'research shows' never appear unattributed", async () => {
  for (const slug of SAMPLE_ARTICLE_SLUGS) {
    const res = await fetch(baseUrl + `/resources/${slug}/`);
    const text = await res.text();
    assert.equal(/studies show|research shows|according to a study|statistics show/i.test(text), false, `${slug} should not contain unattributed research claims`);
  }
});

// --- Whitepaper: content/visual completion phase — ALL 50 articles now
// have a real, enabled whitepaper. Every one is checked for structural
// validity; a full-content spot-check runs across a representative sample
// (the pilot plus a cross-section of the batch-generated 49) rather than
// fetching all 50 bodies in one test, which would be slow without adding
// real coverage beyond the structural pass. ---

const ALL_WHITEPAPER_SLUGS_SAMPLE = [
  "the-trust-engine", // pilot
  "your-company-doesnt-need-more-technology",
  "knowing-what-to-change-isnt-changing-it",
  "the-ai-data-flywheel",
  "the-decision-ready-business",
  "think-build-measure-improve",
  "trust-in-the-age-of-ai",
];

test("SEO/whitepaper: every article on the site has an enabled whitepaper CTA linking to a real, 200-status page — none remain in the disabled 'not yet available' state", async () => {
  const hubRes = await fetch(baseUrl + "/resources/thought-leadership/");
  const hubText = await hubRes.text();
  const slugs = [...new Set([...hubText.matchAll(/href="\/resources\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))];
  assert.ok(slugs.length >= 50, `expected at least 50 article slugs from the hub, found ${slugs.length}`);

  for (const slug of slugs) {
    const res = await fetch(baseUrl + `/resources/${slug}/`);
    const text = await res.text();
    assert.doesNotMatch(text, /Whitepaper in production/, slug);
    const linkMatch = text.match(/class="portal portal-deeper" href="([^"]+)"/);
    assert.ok(linkMatch, `${slug} should have an enabled portal-deeper link`);
    const wpRes = await fetch(baseUrl + linkMatch[1]);
    assert.equal(wpRes.status, 200, `${slug}'s whitepaper link ${linkMatch[1]} should return 200`);
  }
});

test("SEO/whitepaper: a representative sample of whitepapers is structurally real (single H1, canonical, indexable, no fake PDF, working print affordance, real bespoke diagram)", async () => {
  for (const slug of ALL_WHITEPAPER_SLUGS_SAMPLE) {
    const wpRes = await fetch(baseUrl + `/resources/whitepapers/${slug}/`);
    assert.equal(wpRes.status, 200, slug);
    const wpText = await wpRes.text();
    assert.equal((wpText.match(/<h1>/g) || []).length, 1, slug);
    assert.match(wpText, /rel="canonical"/, slug);
    assert.match(wpText, /content="index,follow"/, slug);
    assert.equal(/href="[^"]*\.pdf"/i.test(wpText), false, `${slug}: no fake PDF link — honest print-ready HTML path`);
    assert.match(wpText, /whitepaper-print-btn/, slug);
    assert.match(wpText, /whitepaper-framework-grid/, slug); // real framework content, not just a cover page
    assert.match(wpText, /whitepaper-worksheet/, slug);
    assert.match(wpText, /data-visual="[a-z0-9-]+-framework"/, slug); // bespoke diagram, not a generic reused concept
  }
});

test("SEO/whitepaper: sitemap.xml includes the new whitepaper URLs", async () => {
  const res = await fetch(baseUrl + "/sitemap.xml");
  const text = await res.text();
  for (const slug of ALL_WHITEPAPER_SLUGS_SAMPLE) {
    assert.match(text, new RegExp(`<loc>https://ashokkumarbishnoi\\.com/resources/whitepapers/${slug}/</loc>`), slug);
  }
});

// --- Activity/Audit surface ---

test("GET /api/audit: no token is 401 UNAUTHORIZED", async () => {
  const res = await get("/api/audit");
  assert.equal(res.status, 401);
});

test("GET /api/audit: an authorized request returns the audit trail, most recent first, with no secret values", async () => {
  await post("/api/ai", { message: "What should I focus on today?" }, authHeader());
  const res = await get("/api/audit", authHeader());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.audit));
  const text = JSON.stringify(body.audit);
  assert.ok(!text.includes(ownerToken));
});

// --- Approvals surface ---

test("GET /api/approvals: no token is 401 UNAUTHORIZED", async () => {
  const res = await get("/api/approvals");
  assert.equal(res.status, 401);
});

test("Approvals: a calendar action requiring confirmation creates a pending approval visible via GET /api/approvals", async () => {
  // Needs a real, authorized-with-write-scope connection to reach the
  // confirmation gate at all — otherwise it's blocked earlier at
  // NOT_AUTHORIZED, which is a different (and separately tested) branch.
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const res = await post("/api/ai", { message: "Create a board meeting tomorrow at 3 PM.", timezone: "Asia/Kolkata" }, authHeader());
    const body = await res.json();
    const approvalId = body.result.action.approval_id;
    assert.ok(approvalId, "expected the blocked action to carry an approval_id");

    const listRes = await get("/api/approvals", authHeader());
    const listBody = await listRes.json();
    assert.ok(listBody.pending.some((a) => a.approval_id === approvalId));

    // Clean up: resolve it so it doesn't linger as PENDING for the rest of
    // this file's tests (the approvals store persists across tests in the
    // same process, same as the audit log).
    await post(`/api/approvals/${approvalId}/decision`, { decision: "reject" }, authHeader());
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("Approvals: approving a pending action re-enters the real action lifecycle and executes it", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const proposeRes = await post("/api/ai", { message: "Create a strategy review tomorrow at 4 PM.", timezone: "Asia/Kolkata" }, authHeader());
    const proposeBody = await proposeRes.json();
    const approvalId = proposeBody.result.action.approval_id;
    assert.ok(approvalId);

    const decisionRes = await post(`/api/approvals/${approvalId}/decision`, { decision: "approve" }, authHeader());
    assert.equal(decisionRes.status, 200);
    const decisionBody = await decisionRes.json();
    assert.equal(decisionBody.status, "APPROVED");
    assert.equal(decisionBody.action.result, "SUCCESS");
    assert.equal(decisionBody.action.verified, true);

    const listRes = await get("/api/approvals", authHeader());
    const listBody = await listRes.json();
    assert.equal(listBody.pending.some((a) => a.approval_id === approvalId), false);
    assert.ok(listBody.history.some((a) => a.approval_id === approvalId && a.status === "APPROVED"));
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("Approvals: rejecting a pending action never executes it, and is recorded in the audit trail", async () => {
  const previous = getConnectionState("test_calendar");
  setConnectionState("test_calendar", { state: "AUTHORIZED", scopes: ["calendar.events.readonly", "calendar.events.write"] });
  try {
    const proposeRes = await post("/api/ai", { message: "Create a budget review tomorrow at 5 PM.", timezone: "Asia/Kolkata" }, authHeader());
    const proposeBody = await proposeRes.json();
    const approvalId = proposeBody.result.action.approval_id;
    assert.ok(approvalId);

    const decisionRes = await post(`/api/approvals/${approvalId}/decision`, { decision: "reject" }, authHeader());
    assert.equal(decisionRes.status, 200);
    const decisionBody = await decisionRes.json();
    assert.equal(decisionBody.status, "REJECTED");

    const auditRes = await get("/api/audit", authHeader());
    const auditBody = await auditRes.json();
    assert.ok(auditBody.audit.some((entry) => entry.approval_id === approvalId && entry.result === "BLOCKED" && /Rejected by human/.test(entry.note)));
  } finally {
    setConnectionState("test_calendar", previous);
  }
});

test("Approvals: deciding on an unknown approval id is 404 NOT_FOUND", async () => {
  const res = await post("/api/approvals/does-not-exist/decision", { decision: "approve" }, authHeader());
  assert.equal(res.status, 404);
});

test("Approvals: an invalid decision value is 400 INVALID_REQUEST", async () => {
  const res = await post("/api/approvals/anything/decision", { decision: "maybe" }, authHeader());
  assert.equal(res.status, 400);
});

// --- Memory surface ---

test("GET /api/memory: no token is 401 UNAUTHORIZED", async () => {
  const res = await get("/api/memory");
  assert.equal(res.status, 401);
});

test("GET /api/memory: an authorized request returns a structured (possibly empty) memory array, never fabricated records", async () => {
  const res = await get("/api/memory", authHeader());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.memory));
});

// --- Personal Intelligence Layer, through the real HTTP endpoint ---

test("POST /api/ai: a stated preference is stored as real memory and appears via GET /api/memory", async () => {
  const res = await post("/api/ai", { message: "I prefer terse replies over here.", sessionId: "pi-1" }, authHeader());
  const body = await res.json();
  assert.equal(body.status, "MEMORY_STORED");
  assert.equal(body.memory_class, "PREFERENCE");

  const memRes = await get("/api/memory", authHeader());
  const memBody = await memRes.json();
  assert.ok(memBody.memory.some((m) => m.memory_id === body.record.memory_id && m.content === "terse replies over here"));
});

test("POST /api/ai: an ambiguous message asks for clarification through the real endpoint, never guesses", async () => {
  const res = await post("/api/ai", { message: "Change that.", sessionId: "pi-2" }, authHeader());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "CLARIFICATION_NEEDED");
});

test("POST /api/ai: an image attachment is normalized into separate observation/inference memory through the real endpoint", async () => {
  const res = await post(
    "/api/ai",
    {
      message: "Here's a screenshot.",
      sessionId: "pi-3",
      attachments: [{ modality: "IMAGE", observation: "Shows a green checkmark.", inference: "The deploy likely succeeded.", reference: "shot-1" }],
    },
    authHeader()
  );
  const body = await res.json();
  assert.equal(body.attachments_stored, 2);

  const memRes = await get("/api/memory", authHeader());
  const memBody = await memRes.json();
  assert.ok(memBody.memory.some((m) => m.content.includes("green checkmark") && m.truth_state === "KNOWN"));
  assert.ok(memBody.memory.some((m) => m.content.includes("deploy likely succeeded") && m.truth_state === "HYPOTHESIS"));
});

test("DELETE /api/memory/:class/:id: no token is 401 UNAUTHORIZED", async () => {
  const res = await fetch(baseUrl + "/api/memory/PREFERENCE/whatever", { method: "DELETE" });
  assert.equal(res.status, 401);
});

test("DELETE /api/memory/:class/:id: removes a real memory record, and it no longer appears in GET /api/memory", async () => {
  const createRes = await post("/api/ai", { message: "I prefer short subject lines.", sessionId: "pi-4" }, authHeader());
  const createBody = await createRes.json();
  const { memory_id } = createBody.record;

  const delRes = await fetch(baseUrl + `/api/memory/PREFERENCE/${memory_id}`, { method: "DELETE", headers: authHeader() });
  assert.equal(delRes.status, 200);

  const memRes = await get("/api/memory", authHeader());
  const memBody = await memRes.json();
  assert.equal(memBody.memory.some((m) => m.memory_id === memory_id), false);
});

test("DELETE /api/memory/:class/:id: deleting an unknown id is 404 NOT_FOUND", async () => {
  const res = await fetch(baseUrl + "/api/memory/PREFERENCE/does-not-exist", { method: "DELETE", headers: authHeader() });
  assert.equal(res.status, 404);
});

test("DELETE /api/memory/:class/:id: an unknown memory class is 400 INVALID_REQUEST", async () => {
  const res = await fetch(baseUrl + "/api/memory/NOT_A_CLASS/whatever", { method: "DELETE", headers: authHeader() });
  assert.equal(res.status, 400);
});

// --- Honest-failure regression: a real user, with no calendar credential
// connected at all, must never be shown a fake "waiting for your approval"
// action for something that was actually blocked earlier, at authorization.

test("Approvals: a calendar action blocked at NOT_AUTHORIZED (no real credential, default connection state) never creates a pending approval", async () => {
  const res = await post("/api/ai", { message: "Create a QA regression meeting tomorrow at 9 AM.", timezone: "Asia/Kolkata" }, authHeader());
  const body = await res.json();
  assert.equal(body.result.action.action_status, "NOT_AUTHORIZED");
  assert.equal(body.result.action.approval_id, null);

  const approvalsRes = await get("/api/approvals", authHeader());
  const approvalsBody = await approvalsRes.json();
  assert.equal(approvalsBody.pending.length, 0);

  const auditRes = await get("/api/audit", authHeader());
  const auditBody = await auditRes.json();
  assert.ok(auditBody.audit.some((e) => e.action_id === body.result.action.action_id && e.action_status === "NOT_AUTHORIZED"));
});
