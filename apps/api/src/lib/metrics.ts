import {
  collectDefaultMetrics,
  Counter,
  Gauge,
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
//
// `audience` is "registered" or "guest" on everything below that a visitor
// who isn't signed in can also do — the admin dashboard shows the two side
// by side, and Prometheus is where it reads the live curves from.
export type Audience = "registered" | "guest";

export const watchSecondsTotal = new Counter({
  name: "animeshadow_watch_seconds_total",
  help: "Total seconds of playback reported by clients",
  labelNames: ["audience"] as const,
  registers: [registry],
});

export const watchSessionsTotal = new Counter({
  name: "animeshadow_watch_sessions_total",
  help: "Watch session flushes reported by clients",
  labelNames: ["audience"] as const,
  registers: [registry],
});

export const pageviewsTotal = new Counter({
  name: "animeshadow_pageviews_total",
  help: "Pages opened in the web app (the pageview beacon)",
  labelNames: ["audience"] as const,
  registers: [registry],
});

export const animeViewsTotal = new Counter({
  name: "animeshadow_anime_views_total",
  help: "Title pages opened (/anime/...)",
  labelNames: ["audience"] as const,
  registers: [registry],
});

// -- gauges read from the database at scrape time --------------------------
//
// Totals Prometheus can't add up from counters (a counter restarts with the
// process; the number of accounts doesn't). Read once per scrape at most
// every 30 seconds, whatever the scrape interval, so a tight scrape config
// can't turn into a query storm.

export interface GaugeSnapshot {
  users: number;
  proUsers: number;
  activeRegistered: number;
  activeGuests: number;
  comments: number;
}

let snapshotSource: (() => Promise<GaugeSnapshot>) | null = null;
let snapshot: { at: number; value: GaugeSnapshot } | null = null;
let pending: Promise<GaugeSnapshot> | null = null;

/** Wired once at startup with a function that reads the numbers. */
export function setGaugeSource(source: () => Promise<GaugeSnapshot>): void {
  snapshotSource = source;
}

async function readSnapshot(): Promise<GaugeSnapshot | null> {
  if (!snapshotSource) return null;
  if (snapshot && Date.now() - snapshot.at < 30_000) return snapshot.value;
  pending ??= snapshotSource()
    .then((value) => {
      snapshot = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending.catch(() => snapshot?.value ?? null);
}

function dbGauge(name: string, help: string, pick: (s: GaugeSnapshot) => number, labelNames: string[] = []) {
  return new Gauge({
    name,
    help,
    labelNames,
    registers: [registry],
    async collect() {
      const value = await readSnapshot();
      if (value) this.set(pick(value));
    },
  });
}

dbGauge("animeshadow_users", "Accounts that exist", (s) => s.users);
dbGauge("animeshadow_pro_users", "Accounts with PRO", (s) => s.proUsers);
dbGauge("animeshadow_comments", "Comments, deleted ones included", (s) => s.comments);

new Gauge({
  name: "animeshadow_active_visitors",
  help: "Distinct visitors with a pageview in the last 5 minutes",
  labelNames: ["audience"] as const,
  registers: [registry],
  async collect() {
    const value = await readSnapshot();
    if (!value) return;
    this.set({ audience: "registered" }, value.activeRegistered);
    this.set({ audience: "guest" }, value.activeGuests);
  },
});
