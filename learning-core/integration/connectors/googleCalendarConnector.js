"use strict";

const { ResultStatus, HealthState, AuthState } = require("../../shared/constants");
const { assertConnectorShape } = require("./connector");
const credentials = require("../credentials/reference");

// Reference REAL connector for calendar.event.create / calendar.event.read.
// Endpoints verified live against developers.google.com this session:
//   POST /calendars/{calendarId}/events   -> create (start/end need
//     {dateTime, timeZone}; timeZone is an IANA name, e.g. "Europe/Zurich")
//   GET  /calendars/{calendarId}/events/{eventId} -> read / verify
// OAuth scopes confirmed live: calendar / calendar.events (write),
// calendar.readonly (read).
//
// REAL PROVIDER STATUS = BLOCKED: no OAuth access token exists in this
// environment (GOOGLE_CALENDAR_ACCESS_TOKEN unset). This connector models
// only "we hold a bearer access token" — it does NOT implement the OAuth
// authorization-code/refresh-token flow itself; that is out of scope for
// this milestone and would be the actual prerequisite to un-block it.
const API_BASE = "https://www.googleapis.com/calendar/v3";
const CALENDAR_ID = "primary";
const lastResults = new Map();
let health = { failure_count: 0, last_success_at: null, last_failure_at: null };

// Default to a 1-hour event when the request doesn't specify a duration —
// an application-level default, not a provider requirement.
function addOneHour(time24h) {
  const [h, m] = time24h.split(":").map(Number);
  const endHour = (h + 1) % 24;
  return `${String(endHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function normalizeResult(raw) {
  if (raw.network_error) return ResultStatus.UNKNOWN;
  if (raw.status_code >= 200 && raw.status_code < 300) return ResultStatus.SUCCESS;
  if (raw.status_code === 401 || raw.status_code === 403) return ResultStatus.BLOCKED;
  if (raw.status_code === 404) return ResultStatus.FAILED;
  if (raw.status_code >= 500) return ResultStatus.FAILED;
  return ResultStatus.UNKNOWN;
}

const googleCalendarConnector = {
  tool_id: "google_calendar",

  connect() {
    return { connected: credentials.isAvailable("google_calendar") };
  },

  disconnect() {
    return { connected: false };
  },

  authenticate(fetchImpl = fetch) {
    if (!credentials.isAvailable("google_calendar")) {
      return Promise.resolve({ state: AuthState.DISCONNECTED });
    }
    const token = credentials.getForConnectorUse("google_calendar");
    return fetchImpl(`${API_BASE}/calendars/${CALENDAR_ID}/events?maxResults=1`, { headers: authHeaders(token) })
      .then((res) => {
        if (res.status === 200) {
          health.last_success_at = new Date().toISOString();
          return { state: AuthState.AUTHENTICATED, scopes: [] };
        }
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { state: res.status === 401 ? AuthState.REVOKED : AuthState.ERROR };
      })
      .catch(() => {
        health.failure_count += 1;
        health.last_failure_at = new Date().toISOString();
        return { state: AuthState.ERROR };
      });
  },

  getCapabilities() {
    return ["calendar.event.create", "calendar.event.read"];
  },

  execute(capabilityId, params, { fetchImpl = fetch } = {}) {
    if (!credentials.isAvailable("google_calendar")) {
      return Promise.resolve({
        action_ref: null,
        status_code: null,
        status: ResultStatus.BLOCKED,
        reason: "GOOGLE_CALENDAR_ACCESS_TOKEN not configured — stopping at the credential boundary, no request was sent. Real prerequisite: complete Google OAuth authorization for this account and supply the resulting access token (or wire a refresh-token flow, not implemented in this milestone).",
      });
    }
    const token = credentials.getForConnectorUse("google_calendar");

    if (capabilityId === "calendar.event.create") {
      const body = {
        summary: params.title,
        start: { dateTime: `${params.date}T${params.time}:00`, timeZone: params.timezone },
        end: { dateTime: `${params.date}T${addOneHour(params.time)}:00`, timeZone: params.timezone },
      };
      return fetchImpl(`${API_BASE}/calendars/${CALENDAR_ID}/events`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) })
        .then(async (res) => {
          const responseBody = await res.json().catch(() => null);
          const raw = { status_code: res.status, body: responseBody };
          const status = normalizeResult(raw);
          const actionRef = status === ResultStatus.SUCCESS ? responseBody.id : null;
          if (actionRef) lastResults.set(actionRef, { capabilityId, params, raw });
          if (status === ResultStatus.SUCCESS) health.last_success_at = new Date().toISOString();
          else {
            health.failure_count += 1;
            health.last_failure_at = new Date().toISOString();
          }
          return { action_ref: actionRef, status_code: res.status, status, raw };
        })
        .catch((err) => ({ action_ref: null, status_code: null, status: ResultStatus.UNKNOWN, reason: "Network error: " + err.message }));
    }

    if (capabilityId === "calendar.event.read") {
      return fetchImpl(`${API_BASE}/calendars/${CALENDAR_ID}/events/${encodeURIComponent(params.event_id)}`, { headers: authHeaders(token) })
        .then(async (res) => {
          const responseBody = await res.json().catch(() => null);
          const raw = { status_code: res.status, body: responseBody };
          const status = normalizeResult(raw);
          const actionRef = status === ResultStatus.SUCCESS ? params.event_id : null;
          if (actionRef) lastResults.set(actionRef, { capabilityId, params, raw });
          return { action_ref: actionRef, status_code: res.status, status, raw };
        })
        .catch((err) => ({ action_ref: null, status_code: null, status: ResultStatus.UNKNOWN, reason: "Network error: " + err.message }));
    }

    return Promise.resolve({ action_ref: null, status_code: null, status: ResultStatus.FAILED, reason: "Unsupported capability for this connector." });
  },

  verify(capabilityId, actionRef) {
    const cached = lastResults.get(actionRef);
    if (!cached) return { verified: false, outcome: ResultStatus.UNKNOWN, reason: "No cached result for this action." };
    const matches = !!cached.raw.body && cached.raw.body.id === actionRef;
    return { verified: matches, outcome: matches ? ResultStatus.SUCCESS : ResultStatus.UNKNOWN };
  },

  normalizeResult,

  healthCheck() {
    if (!credentials.isAvailable("google_calendar")) {
      return { state: HealthState.UNKNOWN, ...health, reason: "No credential configured." };
    }
    return { state: health.failure_count > 0 && !health.last_success_at ? HealthState.PROVIDER_ERROR : HealthState.HEALTHY, ...health };
  },

  handleEvent() {
    return { processing_status: "REJECTED", reason: "Push notification / webhook handling for Google Calendar is not implemented in this milestone." };
  },
};

assertConnectorShape(googleCalendarConnector);

module.exports = googleCalendarConnector;
