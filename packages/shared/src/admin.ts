import { z } from "zod";
import type { AnimeSummary } from "./anime.js";
import { passwordSchema, roleSchema } from "./auth.js";

const count = z.number().int().nonnegative();
const page = z.coerce.number().int().positive().default(1);
const perPage = z.coerce.number().int().positive().max(100).default(20);

// ---------------------------------------------------------------------------
// Overview — /admin/overview
// ---------------------------------------------------------------------------

/** A total, and how much of it came in the last 30 days. */
export const adminKpiSchema = z.object({
  total: count,
  current: count,
});
export type AdminKpi = z.infer<typeof adminKpiSchema>;

export const ADMIN_LIBRARY_STATUSES = [
  "WATCHING",
  "PLANNED",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
] as const;

/** One audience's activity over one window. */
export const adminAudienceStatsSchema = z.object({
  /** Distinct browsers (the random visitor id) that opened any page. */
  visitors: count,
  pageviews: count,
  /** Pageviews of a title page — /anime/… */
  animeViews: count,
  /** Distinct titles those views landed on. */
  titles: count,
  watchSessions: count,
  watchSeconds: count,
});
export type AdminAudienceStats = z.infer<typeof adminAudienceStatsSchema>;

export const ADMIN_WINDOWS = ["today", "7d", "30d"] as const;
export type AdminWindow = (typeof ADMIN_WINDOWS)[number];

/** The admin page's header: what the tab badges and "today" pills show —
 *  /admin/summary, a few cheap counts. */
export interface AdminSummary {
  users: number;
  comments: number;
  /** Complaints about profiles still waiting for a decision. */
  reportsOpen: number;
  today: { registered: number; guests: number };
}

/** The overview's top: the numbers and the registered/guests split —
 *  /admin/overview. The rest of the overview loads block by block. */
export const adminOverviewSchema = z.object({
  /** Signed-in visitors next to guests, for each window — the two columns
   *  the dashboard is built around. */
  split: z.array(
    z.object({
      window: z.enum(ADMIN_WINDOWS),
      registered: adminAudienceStatsSchema,
      guests: adminAudienceStatsSchema,
    }),
  ),
  kpis: z.object({
    users: adminKpiSchema,
    /** `total`: every browser ever seen; `current`: the last 30 days. */
    visitors: adminKpiSchema,
    pageviews: adminKpiSchema,
    comments: adminKpiSchema,
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

/** One point per Moscow day, oldest first, zero-filled — 30 entries. Past
 *  days come from the daily rollups; today is counted live. */
export interface AdminTimelinePoint {
  date: string;
  pageviews: number;
  visitors: number;
  registrations: number;
  watchMinutes: number;
  /** The guest share of the day's pageviews and watch time. */
  guestPageviews: number;
  guestWatchMinutes: number;
}

export interface AdminTopAnime {
  anime: AnimeSummary;
  views: number;
  watchers: number;
  /** Title-page opens over the last 30 days, by audience. */
  viewsRegistered: number;
  viewsGuests: number;
  /** Player time over the last 30 days, by audience. */
  watchSecondsRegistered: number;
  watchSecondsGuests: number;
}

/** The overview's lists — /admin/overview/top. */
export interface AdminOverviewTop {
  topAnime: AdminTopAnime[];
  topReferrers: Array<{ host: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
  recentUsers: Array<{ id: string; displayName: string; avatarUrl: string | null; hasTelegram: boolean; createdAt: string }>;
}

// ---------------------------------------------------------------------------
// Users — /admin/users
// ---------------------------------------------------------------------------

export const adminUserQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  role: z.enum(["all", "USER", "ADMIN"]).default("all"),
  status: z.enum(["all", "active", "banned"]).default("all"),
  sort: z.enum(["newest", "oldest", "lastSeen", "name", "comments", "library"]).default("newest"),
  page,
  perPage,
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: roleSchema,
  isBanned: z.boolean(),
  hasTelegram: z.boolean(),
  username: z.string().nullable(),
  isPro: z.boolean(),
  commentCount: count,
  libraryCount: count,
  /** Seconds watched in the player, all time. */
  watchSeconds: count,
  /** Last page opened while signed in; null if never seen since tracking began. */
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUpdateUserInputSchema = z
  .object({
    role: roleSchema.optional(),
    isBanned: z.boolean().optional(),
    /** Experience granted on top of what the account earned (sets the level). */
    bonusXp: z.number().int().min(0).max(2_000_000_000).optional(),
  })
  .refine((v) => v.role !== undefined || v.isBanned !== undefined || v.bonusXp !== undefined, {
    message: "Nothing to update",
  });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserInputSchema>;

// ---------------------------------------------------------------------------
// Comments — /admin/comments
// ---------------------------------------------------------------------------

export const adminCommentQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  animeId: z.coerce.number().int().positive().optional(),
  status: z.enum(["all", "active", "deleted"]).default("all"),
  sort: z.enum(["newest", "oldest", "top"]).default("newest"),
  page,
  perPage,
});
export type AdminCommentQuery = z.infer<typeof adminCommentQuerySchema>;

export const adminCommentSummarySchema = z.object({
  id: z.string(),
  animeId: z.number().int(),
  animeSlug: z.string(),
  animeTitle: z.string(),
  animeImageUrl: z.string().nullable(),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string().nullable(),
  body: z.string(),
  mode: z.string(),
  likeCount: count,
  dislikeCount: count,
  deleted: z.boolean(),
  createdAt: z.string(),
});
export type AdminCommentSummary = z.infer<typeof adminCommentSummarySchema>;

// ---------------------------------------------------------------------------
// One user, everything — /admin/users/:id
// ---------------------------------------------------------------------------

export const adminUserDetailSchema = z.object({
  user: adminUserSummarySchema.extend({
    /** What to type on the login form: the account's email. For a Telegram
     * account this is the placeholder address it was created with. */
    loginEmail: z.string(),
    bannerUrl: z.string().nullable(),
    bio: z.string().nullable(),
    onlineStatus: z.string(),
    emailVerified: z.boolean(),
    proSince: z.string().nullable(),
    /** Only whether it is set and the resulting age gate — never the date. */
    ageVerified: z.boolean(),
    referrer: z.string().nullable(),
    achievements: count,
  }),
  activity: z.object({
    pageviews: count,
    pageviews30d: count,
    activeDays30d: count,
    /** One entry per UTC day, oldest first, always 30 of them. */
    daily: z.array(z.object({ date: z.string(), pageviews: count, watchMinutes: count })),
    recentPages: z.array(z.object({ path: z.string(), createdAt: z.string() })),
  }),
  watch: z.object({
    seconds: count,
    sessions: count,
    topAnime: z.array(
      z.object({
        animeId: z.number().int(),
        slug: z.string(),
        title: z.string(),
        imageUrl: z.string().nullable(),
        seconds: count,
      }),
    ),
  }),
  library: z.object({
    byStatus: z.array(z.object({ status: z.enum(ADMIN_LIBRARY_STATUSES), count })),
    recent: z.array(
      z.object({
        animeId: z.number().int(),
        slug: z.string(),
        title: z.string(),
        imageUrl: z.string().nullable(),
        status: z.enum(ADMIN_LIBRARY_STATUSES),
        score: z.number().int().nullable(),
        progress: count,
        episodes: z.number().int().nullable(),
        updatedAt: z.string(),
      }),
    ),
  }),
  comments: z.object({
    total: count,
    deleted: count,
    likesReceived: count,
    recent: z.array(
      z.object({
        id: z.string(),
        animeSlug: z.string(),
        animeTitle: z.string(),
        body: z.string(),
        likeCount: count,
        deleted: z.boolean(),
        createdAt: z.string(),
      }),
    ),
  }),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** A new password chosen by an admin; same rules as signing up. */
export const adminSetPasswordInputSchema = z.object({ password: passwordSchema });
export type AdminSetPasswordInput = z.infer<typeof adminSetPasswordInputSchema>;

// ---------------------------------------------------------------------------
// Monitoring — /admin/monitoring, read from Prometheus
// ---------------------------------------------------------------------------

export const ADMIN_MONITORING_RANGES = ["1h", "6h", "24h", "7d"] as const;
export type AdminMonitoringRange = (typeof ADMIN_MONITORING_RANGES)[number];

export const adminMonitoringQuerySchema = z.object({
  range: z.enum(ADMIN_MONITORING_RANGES).default("24h"),
});

export const ADMIN_MONITORING_PANELS = [
  "requests",
  "latency",
  "errors",
  "pageviews",
  "watch",
  "active",
  "signups",
  "memory",
  "cpu",
] as const;
export type AdminMonitoringPanel = (typeof ADMIN_MONITORING_PANELS)[number];

export const adminMonitoringSchema = z.object({
  /** False when Prometheus could not be reached — the panels are then empty
   *  and `error` says why. */
  available: z.boolean(),
  error: z.string().nullable(),
  range: z.enum(ADMIN_MONITORING_RANGES),
  /** Whether Prometheus itself reports the API target as up. */
  targetUp: z.boolean().nullable(),
  lastScrape: z.string().nullable(),
  panels: z.array(
    z.object({
      id: z.enum(ADMIN_MONITORING_PANELS),
      series: z.array(
        z.object({
          /** A stable key the page labels ("registered", "guests", "p95"…). */
          key: z.string(),
          /** [unix seconds, value] */
          points: z.array(z.tuple([z.number(), z.number()])),
        }),
      ),
    }),
  ),
});
export type AdminMonitoring = z.infer<typeof adminMonitoringSchema>;

/* ------------------------------------------------------------------------ */
/* Analytics tab: everything about visits, for any period, filtered.        */
/* ------------------------------------------------------------------------ */

export const ANALYTICS_AUDIENCES = ["all", "guests", "users"] as const;
export const ANALYTICS_DEVICES = ["all", "mobile", "tablet", "desktop"] as const;

export const adminAnalyticsQuerySchema = z.object({
  /** ISO date-time; defaults to 30 days back. */
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  audience: z.enum(ANALYTICS_AUDIENCES).default("all"),
  device: z.enum(ANALYTICS_DEVICES).default("all"),
  /** Only page views whose path contains this. */
  path: z.string().trim().max(200).optional(),
  /** Count crawlers too (off by default). */
  bots: z.coerce.boolean().default(false),
  /** IANA zone for days and hours, e.g. Europe/Moscow. */
  tz: z
    .string()
    .regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/)
    .default("Europe/Moscow"),
});
export type AdminAnalyticsQuery = z.infer<typeof adminAnalyticsQuerySchema>;

export interface AdminAnalyticsSummary {
  visitors: number;
  users: number;
  newVisitors: number;
  returningVisitors: number;
  sessions: number;
  pageviews: number;
  /** Sessions with a single page view, 0–1. */
  bounceRate: number;
  pagesPerSession: number;
  avgSessionSec: number;
  avgPageSec: number;
  registrations: number;
  watchMinutes: number;
}

export interface AdminAnalyticsRow {
  key: string;
  /** A friendlier label when the key is an id (an anime title, say). */
  label?: string;
  href?: string;
  pageviews: number;
  visitors: number;
  avgSec: number | null;
}

/** The analytics tab's numbers and curve — /admin/analytics. Every other
 *  block of the tab is its own request (below), loaded when it is shown. */
export interface AdminAnalytics {
  range: { from: string; to: string; bucket: "hour" | "day" };
  summary: AdminAnalyticsSummary;
  previous: AdminAnalyticsSummary;
  series: Array<{
    at: string;
    visitors: number;
    users: number;
    newVisitors: number;
    sessions: number;
    pageviews: number;
    registrations: number;
  }>;
  /** The period before, bucket for bucket — for the dashed line. */
  previousSeries: AdminAnalytics["series"];
  /** Raw page views are kept from this moment on (older days only as daily
   *  rollups, see the archive); null when there are none at all. */
  rawSince: string | null;
}

/** Who is on the site right now (the last five minutes) — /admin/analytics/live. */
export interface AdminAnalyticsLive {
  visitors: number;
  pageviews: number;
}

/** Day of week (0 = Sunday) × hour, in the chosen time zone — /admin/analytics/heatmap. */
export type AdminAnalyticsHeatmap = Array<{ dow: number; hour: number; pageviews: number }>;

export interface AdminAnalyticsBreakdowns {
  pages: AdminAnalyticsRow[];
  sections: AdminAnalyticsRow[];
  entryPages: AdminAnalyticsRow[];
  anime: AdminAnalyticsRow[];
  referrers: AdminAnalyticsRow[];
  utmSources: AdminAnalyticsRow[];
  utmCampaigns: AdminAnalyticsRow[];
  devices: AdminAnalyticsRow[];
  browsers: AdminAnalyticsRow[];
  os: AdminAnalyticsRow[];
  langs: AdminAnalyticsRow[];
  screens: AdminAnalyticsRow[];
}

/** The breakdown tables come a group at a time — only the one on screen. */
export const ANALYTICS_BREAKDOWN_GROUPS = ["pages", "sources", "tech"] as const;
export type AdminAnalyticsBreakdownGroup = (typeof ANALYTICS_BREAKDOWN_GROUPS)[number];
export const adminBreakdownQuerySchema = adminAnalyticsQuerySchema.extend({
  group: z.enum(ANALYTICS_BREAKDOWN_GROUPS).default("pages"),
});
export type AdminBreakdownQuery = z.infer<typeof adminBreakdownQuerySchema>;

/** How many visitors who first came in a week came back in the weeks after
 *  — /admin/analytics/retention. */
export type AdminAnalyticsRetention = Array<{ week: string; visitors: number; returned: number[] }>;

/** One month of the daily rollups — /admin/analytics/archive. `visitors` is
 *  summed over the days (a visitor back on another day counts again). */
export interface AdminArchiveMonth {
  month: string;
  days: number;
  pageviews: number;
  visitors: number;
  sessions: number;
  newVisitors: number;
  registrations: number;
  watchMinutes: number;
}

export interface AdminArchiveKey {
  key: string;
  label?: string;
  href?: string;
  views: number;
  uniques: number;
}

/** One month in detail, from the rollups — /admin/analytics/archive/:month. */
export interface AdminArchiveDetail {
  month: string;
  days: Array<{ day: string; pageviews: number; visitors: number; registrations: number; watchMinutes: number }>;
  /** Top keys of each kind: page, section, anime, referrer, utm, device,
   *  browser, os, lang, and "watch" (views = seconds, uniques = sessions). */
  top: Record<string, AdminArchiveKey[]>;
}

export const ANALYTICS_VISITOR_SORTS = ["last", "first", "pageviews", "sessions", "time"] as const;

export const adminVisitorsQuerySchema = adminAnalyticsQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(ANALYTICS_VISITOR_SORTS).default("last"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(10).max(100).default(30),
});
export type AdminVisitorsQuery = z.infer<typeof adminVisitorsQuerySchema>;

export interface AdminVisitor {
  visitorId: string;
  user: { id: string; displayName: string; username: string | null; avatarUrl: string | null } | null;
  firstSeen: string;
  lastSeen: string;
  pageviews: number;
  sessions: number;
  totalSec: number;
  device: string | null;
  browser: string | null;
  os: string | null;
  lang: string | null;
  source: string | null;
  /** First seen inside the chosen period. */
  isNew: boolean;
}

export interface AdminVisitorDetail {
  visitor: AdminVisitor;
  views: Array<{
    at: string;
    path: string;
    sessionId: string | null;
    entry: boolean;
    durationSec: number | null;
    device: string | null;
    browser: string | null;
    os: string | null;
    screenW: number | null;
    source: string | null;
    utm: string | null;
  }>;
}

/** Third-party counters: which are on, where their dashboards are, and —
 *  when the API token is configured — Yandex Metrica's own numbers. */
export interface AdminExternalAnalytics {
  yandex: {
    counterId: string | null;
    dashboardUrl: string | null;
    /** null when no API token is set or the API didn't answer. */
    stats: {
      visits: number;
      users: number;
      pageviews: number;
      bounceRate: number;
      avgVisitSec: number;
      sources: Array<{ name: string; visits: number }>;
      searchPhrases: Array<{ name: string; visits: number }>;
    } | null;
    error: string | null;
  };
  google: { measurementId: string | null; dashboardUrl: string | null };
  umami: { websiteId: string | null; dashboardUrl: string | null };
}
