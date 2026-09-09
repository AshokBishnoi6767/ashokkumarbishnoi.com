"use strict";

const { ProviderStatus } = require("../../shared/constants");

// Canonical Provider Registry (target ecosystem from the approved
// architecture). `verified` distinguishes documentation actually checked
// this session from general-knowledge claims not re-verified — per the
// rule "if documentation is unclear, mark it UNKNOWN," nothing here was
// upgraded to SUPPORTED on a guess. See `notes` for what's still open.
const PROVIDERS = [
  { provider_id: "openai", display_name: "OpenAI", category: "AI", status: ProviderStatus.SUPPORTED, verified: false, notes: "Well-documented public API (API key auth). Not re-checked live this session." },
  { provider_id: "anthropic", display_name: "Anthropic", category: "AI", status: ProviderStatus.SUPPORTED, verified: false, notes: "Well-documented public API (API key auth). Not re-checked live this session." },
  { provider_id: "google_gemini", display_name: "Google / Gemini", category: "AI", status: ProviderStatus.SUPPORTED, verified: false, notes: "Public Gemini API. Not re-checked live this session." },
  { provider_id: "adobe_firefly", display_name: "Adobe Firefly", category: "Creative", status: ProviderStatus.REQUIRES_SPECIAL_ACCESS, verified: true, notes: "Public Firefly API confirmed to exist (checked developer.adobe.com); exact access/auth model (Adobe Developer Console project, likely enterprise) not fully confirmed this session." },
  { provider_id: "figma", display_name: "Figma", category: "Creative", status: ProviderStatus.SUPPORTED, verified: false, notes: "Public REST API with personal access tokens. Not re-checked live this session." },
  { provider_id: "canva", display_name: "Canva", category: "Creative", status: ProviderStatus.SUPPORTED, verified: false, notes: "Canva Connect API (OAuth) for autofill/design automation. Not re-checked live this session." },
  { provider_id: "runway", display_name: "Runway", category: "Video", status: ProviderStatus.SUPPORTED, verified: true, notes: "Confirmed live: public Dev API at dev.runwayml.com, API-key auth, image/video generation endpoints. Access must be requested." },
  { provider_id: "napkin_ai", display_name: "Napkin AI", category: "Creative", status: ProviderStatus.UNKNOWN, verified: true, notes: "Checked napkin.ai this session — no public developer API/SDK documentation found. May not exist for third-party use; not ruled out entirely." },
  { provider_id: "google_flow", display_name: "Google Flow", category: "Video", status: ProviderStatus.NOT_SUPPORTED, verified: true, notes: "Checked this session: 'Google Flow' is a consumer product, not a distinct developer API. The equivalent capability (video generation) is reachable via the Gemini API (Veo models) under provider 'google_gemini', not this entry." },
  { provider_id: "ga4", display_name: "Google Analytics 4", category: "Analytics", status: ProviderStatus.SUPPORTED, verified: false, notes: "Google Analytics Data API (OAuth/service account). Not re-checked live this session." },
  { provider_id: "google_search_console", display_name: "Google Search Console", category: "Analytics", status: ProviderStatus.SUPPORTED, verified: false, notes: "Search Console API (OAuth/service account). Not re-checked live this session." },
  { provider_id: "hotjar", display_name: "Hotjar", category: "Analytics", status: ProviderStatus.UNKNOWN, verified: false, notes: "Historically a narrow API surface (exports, not general read access). Not verified this session — do not assume capability parity with GA4." },
  { provider_id: "hubspot", display_name: "HubSpot", category: "Business", status: ProviderStatus.SUPPORTED, verified: false, notes: "Extensive public API (OAuth/private app tokens). Not re-checked live this session." },
  { provider_id: "calendly", display_name: "Calendly", category: "Business", status: ProviderStatus.SUPPORTED, verified: true, notes: "Confirmed API v2 + OAuth exist (developer.calendly.com). Whether it exposes real-time availability slots is unconfirmed — see capability 'calendly.get_availability', marked UNKNOWN." },
  { provider_id: "google_calendar", display_name: "Google Calendar", category: "Business", status: ProviderStatus.SUPPORTED, verified: false, notes: "Google Calendar API (OAuth). Not re-checked live this session." },
  { provider_id: "gmail", display_name: "Gmail", category: "Business", status: ProviderStatus.SUPPORTED, verified: false, notes: "Gmail API (OAuth). Not re-checked live this session." },
  { provider_id: "google_drive", display_name: "Google Drive", category: "Business", status: ProviderStatus.SUPPORTED, verified: false, notes: "Drive API (OAuth). Not re-checked live this session." },
  { provider_id: "linkedin", display_name: "LinkedIn", category: "Business", status: ProviderStatus.REQUIRES_SPECIAL_ACCESS, verified: false, notes: "Posting/marketing capabilities typically require partner-program approval. Not re-checked live this session." },
  { provider_id: "whatsapp", display_name: "WhatsApp", category: "Business", status: ProviderStatus.REQUIRES_SPECIAL_ACCESS, verified: false, notes: "WhatsApp Business Platform requires Meta Business verification + phone number registration. Not re-checked live this session." },
  { provider_id: "github", display_name: "GitHub", category: "Development", status: ProviderStatus.IMPLEMENTED, verified: true, notes: "Confirmed live this session (docs.github.com): GET /repos/{owner}/{repo}, GET /repos/{owner}/{repo}/commits, GET /user. Reference connector implemented in this phase; NOT_CONNECTED until a credential is configured." },
  { provider_id: "firebase", display_name: "Firebase", category: "Infrastructure", status: ProviderStatus.SUPPORTED, verified: false, notes: "Already used for hosting via CI/CD (Workload Identity Federation), but not through this Control Layer. No connector built yet for Control-Layer-driven Firebase operations." },
  { provider_id: "google_cloud", display_name: "Google Cloud", category: "Infrastructure", status: ProviderStatus.SUPPORTED, verified: false, notes: "Broad set of documented APIs. Not re-checked live this session; no connector built yet." },
  { provider_id: "namecheap", display_name: "Namecheap", category: "Infrastructure", status: ProviderStatus.MANUAL, verified: false, notes: "Namecheap has an API, but DNS changes are CRITICAL risk (see RiskLevel). Kept MANUAL by policy pending explicit Ashok/ChatGPT approval, independent of technical feasibility." },
];

function listProviders() {
  return PROVIDERS;
}

function getProvider(providerId) {
  return PROVIDERS.find((p) => p.provider_id === providerId) || null;
}

module.exports = { listProviders, getProvider };
