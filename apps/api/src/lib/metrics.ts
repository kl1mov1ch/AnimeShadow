import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";

/**
 * One process-wide Prometheus registry. Everything here is an in-memory
 * counter/histogram bump on the request path that was already happening —
 * no extra DB round trip, no extra request from the browser. Prometheus
 * pulls the current values on its own schedule (GET /metrics); the app
 * never pushes anything anywhere. That's the whole point: watch-time and
 * traffic trends become visible in Grafana without adding a single query to
 * Postgres, on top of what the feature itself already needed.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

/** Every HTTP response, labelled by method/route/status — the route label
 * uses Fastify's matched pattern (`/api/anime/:id`), not the raw URL, so
 * cardinality stays bounded regardless of how many distinct ids get hit. */
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

// -- product metrics ---------------------------------------------------

export const registrationsTotal = new Counter({
  name: "animeshadow_registrations_total",
  help: "Accounts created",
  registers: [registry],
});

export const accountsDeletedTotal = new Counter({
  name: "animeshadow_accounts_deleted_total",
  help: "Accounts permanently deleted by their owner",
  registers: [registry],
});

export const loginsTotal = new Counter({
  name: "animeshadow_logins_total",
  help: "Successful logins",
  labelNames: ["method"] as const, // "password" | "telegram"
  registers: [registry],
});

export const emailsSentTotal = new Counter({
  name: "animeshadow_emails_sent_total",
  help: "Transactional emails sent",
  labelNames: ["kind"] as const, // "verification" | "password_reset"
  registers: [registry],
});

/** Seconds of playback reported by the player — the same number that's
 * already written to WatchSession (see ProfileService), mirrored here as a
 * cheap running total so "how much are people actually watching, right
 * now" is a Grafana panel instead of an aggregate query against Postgres. */
export const watchSecondsTotal = new Counter({
  name: "animeshadow_watch_seconds_total",
  help: "Total seconds of playback reported by clients",
  registers: [registry],
});

export const watchSessionsTotal = new Counter({
  name: "animeshadow_watch_sessions_total",
  help: "Watch session flushes reported by clients",
  registers: [registry],
});
