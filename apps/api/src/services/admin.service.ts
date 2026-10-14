import {
  ANIME_WITH_GENRES_INCLUDE,
  Prisma,
  type PrismaClient,
  toSummaryDto,
} from "@animeshadow/db";
import { IS_MEMBER, moscowDayStart, NOT_BOT as PEOPLE_NOT_BOT, PERSON } from "../lib/people.js";
import { proActive } from "../lib/pro.js";
import {
  ADMIN_LIBRARY_STATUSES,
  type AdminAudienceStats,
  type AdminMonitoring,
  type AdminMonitoringPanel,
  type AdminMonitoringRange,
  type AdminWindow,
  type AdminCommentQuery,
  type AdminCommentSummary,
  type AdminOverview,
  type AdminOverviewTop,
  type AdminReportGroup,
  type AdminReportQuery,
  type AdminResolveReportsInput,
  type AdminResolveReportsResult,
  type AdminSummary,
  type AdminTimelinePoint,
  type AdminUpdateUserInput,
  type AdminUserDetail,
  type AdminUserQuery,
  type AdminUserSummary,
  paginated,
  type Paginated,
  type ReportMeasure,
  type ReportReason,
  type ReportStatus,
} from "@animeshadow/shared";
import bcrypt from "bcryptjs";
import { TtlCache } from "../lib/cache.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { forgetSession, revokeSessions } from "../lib/session-guard.js";
import { STATS_TZ } from "./stats-rollup.service.js";
import type { GaugeSnapshot } from "../lib/metrics.js";

export interface AdminServiceDeps {
  prisma: PrismaClient;
  logger?: { info: (obj: unknown, msg?: string) => void };
  /** Where Prometheus answers queries. Server-side only. */
  prometheusUrl?: string;
}

/** Title pages are /anime/<id>[-slug]; the id is what we group by. */
const ANIME_PATH = "^/anime/([0-9]+)";

/**
 * The monitoring tab's panels as fixed PromQL — the browser picks a panel
 * and a range, never a query, so an admin session can't be turned into an
 * open window onto Prometheus. `$w` is the rate window, `$s` the step.
 */
const PANELS: Record<AdminMonitoringPanel, Array<{ key: string; query: string; byLabel?: string }>> = {
  requests: [{ key: "total", query: "sum(rate(http_requests_total[$w]))" }],
  latency: [
    {
      key: "p50",
      query: "histogram_quantile(0.5, sum by (le) (rate(http_request_duration_seconds_bucket[$w])))",
    },
    {
      key: "p95",
      query: "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[$w])))",
    },
  ],
  errors: [
    { key: "5xx", query: 'sum(rate(http_requests_total{status=~"5.."}[$w])) or vector(0)' },
    { key: "4xx", query: 'sum(rate(http_requests_total{status=~"4.."}[$w])) or vector(0)' },
  ],
  pageviews: [
    { key: "audience", byLabel: "audience", query: "sum by (audience) (increase(animeshadow_pageviews_total[$s]))" },
  ],
  watch: [
    {
      key: "audience",
      byLabel: "audience",
      query: "sum by (audience) (increase(animeshadow_watch_seconds_total[$s])) / 60",
    },
  ],
  active: [{ key: "audience", byLabel: "audience", query: "sum by (audience) (animeshadow_active_visitors)" }],
  signups: [
    { key: "registrations", query: "sum(increase(animeshadow_registrations_total[$s])) or vector(0)" },
    { key: "logins", query: "sum(increase(animeshadow_logins_total[$s])) or vector(0)" },
  ],
  memory: [
    { key: "rss", query: "sum(process_resident_memory_bytes)" },
    { key: "heap", query: "sum(nodejs_heap_size_used_bytes)" },
  ],
  cpu: [{ key: "cpu", query: "sum(rate(process_cpu_seconds_total[$w])) * 100" }],
};

const RANGES: Record<AdminMonitoringRange, { seconds: number; step: string; stepSeconds: number; window: string }> = {
  "1h": { seconds: 3600, step: "1m", stepSeconds: 60, window: "2m" },
  "6h": { seconds: 6 * 3600, step: "5m", stepSeconds: 300, window: "5m" },
  "24h": { seconds: 24 * 3600, step: "15m", stepSeconds: 900, window: "15m" },
  "7d": { seconds: 7 * 24 * 3600, step: "1h", stepSeconds: 3600, window: "1h" },
};

interface PromMatrix {
  status: string;
  error?: string;
  data?: { result: Array<{ metric: Record<string, string>; values: Array<[number, string]> }> };
}

/** Same cost as AuthService uses at signup, so an admin-set password is
 * exactly as strong at rest as one the user chose. */
const BCRYPT_ROUNDS = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMELINE_DAYS = 30;

/** Groups a raw `referrer` string down to a display host — "direct" for
 * no referrer at all, "unknown" for a value that isn't a parseable URL. */
function referrerHost(referrer: string | null): string {
  if (!referrer) return "direct";
  try {
    return new URL(referrer).hostname || "direct";
  } catch {
    return "unknown";
  }
}

/** "YYYY-MM-DD" moved by whole days. */
function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  isBanned: true,
  telegramId: true,
  username: true,
  proSince: true,
  trialUntil: true,
  proUntil: true,
  lastSeenAt: true,
  createdAt: true,
  _count: { select: { comments: true, library: true } },
} satisfies Prisma.UserSelect;

type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof USER_SUMMARY_SELECT }>;

function toUserSummary(u: UserSummaryRow, watchSeconds = 0): AdminUserSummary {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    role: u.role === "ADMIN" ? "ADMIN" : "USER",
    isBanned: u.isBanned,
    hasTelegram: u.telegramId != null,
    username: u.username,
    isPro: proActive(u),
    commentCount: u._count.comments,
    libraryCount: u._count.library,
    watchSeconds,
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

const CONTENT_ANIME_SELECT = {
  slug: true,
  title: true,
  titleLocalized: true,
  imageUrl: true,
} satisfies Prisma.AnimeSelect;

const CONTENT_AUTHOR_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

interface Windows {
  now: Date;
  todayStart: Date;
  last7: Date;
  last30: Date;
}

const NOT_BOT = "(device IS NULL OR device <> 'bot')";

export class AdminService {
  private readonly prometheusUrl: string;
  private readonly monitoringCache = new TtlCache<AdminMonitoring>(20_000, 8);
  /** The overview's blocks: the numbers for a minute, the rest for five. */
  private readonly overviewCache = new TtlCache<unknown>(60_000, 8);
  private readonly blockCache = new TtlCache<unknown>(5 * 60_000, 8);
  private readonly logger: AdminServiceDeps["logger"];
  private readonly prisma: PrismaClient;

  constructor(deps: AdminServiceDeps) {
    this.prometheusUrl = (deps.prometheusUrl ?? "http://127.0.0.1:9090").replace(/\/$/, "");
    this.prisma = deps.prisma;
    this.logger = deps.logger;
  }

  private windows(): Windows {
    const now = new Date();
    return {
      now,
      todayStart: moscowDayStart(now),
      last7: new Date(now.getTime() - 7 * DAY_MS),
      last30: new Date(now.getTime() - 30 * DAY_MS),
    };
  }

  /** The admin page's header: the tab badges and today's two pills. Three
   *  cheap counts, read on every tab — the overview itself is not. */
  async summary(): Promise<AdminSummary> {
    // Not cached with the rest: a new complaint should show on the badge at once.
    const [base, reportsOpen] = await Promise.all([
      this.cachedSummary(),
      this.prisma.profileReport.count({ where: { status: "OPEN" } }),
    ]);
    return { ...base, reportsOpen };
  }

  private async cachedSummary(): Promise<Omit<AdminSummary, "reportsOpen">> {
    return this.overviewCache.wrap("summary", async () => {
      // People today (Moscow day, no crawlers) — the same count as the
      // overview's "today" and the day-by-day table.
      const since = moscowDayStart();
      const [users, comments, today] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.comment.count(),
        this.prisma.$queryRaw<Array<{ registered: boolean; visitors: number }>>`
          SELECT ${IS_MEMBER} AS registered, COUNT(DISTINCT ${PERSON})::int AS visitors
          FROM "PageView" WHERE "createdAt" >= ${since} AND ${PEOPLE_NOT_BOT}
          GROUP BY 1
        `,
      ]);
      return {
        users,
        comments,
        today: {
          registered: today.find((r) => r.registered)?.visitors ?? 0,
          guests: today.find((r) => !r.registered)?.visitors ?? 0,
        },
      };
    }) as Promise<Omit<AdminSummary, "reportsOpen">>;
  }

  /**
   * The overview's top: the four numbers and the registered/guests table.
   * The curve and the lists are their own requests (overviewTimeline,
   * overviewTop), loaded when they come into view. What used to come with
   * this and was never shown — hours by hour, library statuses, genres,
   * comments, previous-period values — is no longer computed at all.
   */
  async overview(): Promise<AdminOverview> {
    return this.overviewCache.wrap("overview", async () => {
      const w = this.windows();
      const [split, kpis] = await Promise.all([this.split(w), this.kpis(w)]);
      return { split, kpis };
    }) as Promise<AdminOverview>;
  }

  // -- overview pieces ---------------------------------------------------

  /** Signed-in visitors and guests, side by side, for today / 7 / 30 days. */
  private async split(w: Windows): Promise<AdminOverview["split"]> {
    const windows: Array<[AdminWindow, Date]> = [
      ["today", w.todayStart],
      ["7d", w.last7],
      ["30d", w.last30],
    ];
    return Promise.all(
      windows.map(async ([window, since]) => {
        const [traffic, registeredWatch, guestWatch] = await Promise.all([
          this.prisma.$queryRaw<
            Array<{ registered: boolean; visitors: number; pageviews: number; anime: number; titles: number }>
          >`
            SELECT
              ${IS_MEMBER} AS registered,
              COUNT(DISTINCT ${PERSON})::int AS visitors,
              COUNT(*)::int AS pageviews,
              COUNT(*) FILTER (WHERE path ~ ${ANIME_PATH})::int AS anime,
              COUNT(DISTINCT substring(path from ${ANIME_PATH}))::int AS titles
            FROM "PageView"
            WHERE "createdAt" >= ${since} AND ${PEOPLE_NOT_BOT}
            GROUP BY 1
          `,
          this.prisma.watchSession.aggregate({
            where: { startedAt: { gte: since } },
            _count: { _all: true },
            _sum: { seconds: true },
          }),
          this.prisma.guestWatchSession.aggregate({
            where: { startedAt: { gte: since } },
            _count: { _all: true },
            _sum: { seconds: true },
          }),
        ]);
        const side = (registered: boolean, watch: typeof registeredWatch): AdminAudienceStats => {
          const row = traffic.find((r) => r.registered === registered);
          return {
            visitors: row?.visitors ?? 0,
            pageviews: row?.pageviews ?? 0,
            animeViews: row?.anime ?? 0,
            titles: row?.titles ?? 0,
            watchSessions: watch._count._all,
            watchSeconds: watch._sum.seconds ?? 0,
          };
        };
        return { window, registered: side(true, registeredWatch), guests: side(false, guestWatch) };
      }),
    );
  }

  private async kpis(w: Windows): Promise<AdminOverview["kpis"]> {
    const current = { gte: w.last30 };
    const [usersTotal, usersCurrent, [visitors], [views], commentsTotal, commentsCurrent] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: current } }),
      this.prisma.$queryRaw<Array<{ total: number; current: number }>>`
        SELECT
          ((SELECT COUNT(*) FROM "VisitorFirstSeen" f
              WHERE NOT EXISTS (SELECT 1 FROM "VisitorUser" vu WHERE vu."visitorId" = f."visitorId"))
            + (SELECT COUNT(DISTINCT "userId") FROM "VisitorUser"))::int AS total,
          (SELECT COUNT(DISTINCT ${PERSON}) FROM "PageView"
            WHERE "createdAt" >= ${w.last30} AND ${PEOPLE_NOT_BOT})::int AS current
      `,
      // All-time page views: the rolled-up days, plus the raw rows after them
      // (the raw table itself only keeps the last few months).
      this.prisma.$queryRaw<Array<{ total: number; current: number }>>`
        WITH rolled AS (
          SELECT COALESCE(SUM(pageviews), 0) AS views,
            ((MAX(day) + 1)::timestamp AT TIME ZONE ${STATS_TZ}) AT TIME ZONE 'UTC' AS until
          FROM "StatDay"
        )
        SELECT
          ((SELECT views FROM rolled) + (
            SELECT COUNT(*) FROM "PageView"
            WHERE ${Prisma.raw(NOT_BOT)} AND "createdAt" >= COALESCE((SELECT until FROM rolled), '-infinity'::timestamp)
          ))::bigint::float AS total,
          (SELECT COUNT(*) FROM "PageView" WHERE "createdAt" >= ${w.last30})::int AS current
      `,
      this.prisma.comment.count(),
      this.prisma.comment.count({ where: { createdAt: current } }),
    ]);
    return {
      users: { total: usersTotal, current: usersCurrent },
      visitors: { total: visitors?.total ?? 0, current: visitors?.current ?? 0 },
      pageviews: { total: Math.round(views?.total ?? 0), current: views?.current ?? 0 },
      comments: { total: commentsTotal, current: commentsCurrent },
    };
  }

  /**
   * Thirty Moscow days of traffic and watching. Finished days come from the
   * daily rollups (StatDay) — a row per day, nothing to count — and only the
   * days not rolled up yet (today, usually) are counted from the raw rows.
   */
  async overviewTimeline(): Promise<AdminTimelinePoint[]> {
    return this.blockCache.wrap("timeline", async () => {
      const [now] = await this.prisma.$queryRaw<Array<{ today: string }>>`
        SELECT to_char((now() AT TIME ZONE ${STATS_TZ})::date, 'YYYY-MM-DD') AS today
      `;
      const today = now?.today ?? new Date().toISOString().slice(0, 10);
      const days = Array.from({ length: TIMELINE_DAYS }, (_, i) => shiftDay(today, i - (TIMELINE_DAYS - 1)));
      const first = days[0]!;
      const rolled = await this.prisma.$queryRaw<
        Array<{ day: string; audience: string; pageviews: number; visitors: number; registrations: number; watch: number }>
      >`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, audience, pageviews, visitors, registrations, "watchSec" AS watch
        FROM "StatDay" WHERE day >= ${first}::date
      `;
      const have = new Set(rolled.map((r) => r.day));
      const missing = days.filter((d) => !have.has(d));

      const points = new Map<string, AdminTimelinePoint>(
        days.map((date) => [
          date,
          { date, pageviews: 0, visitors: 0, registrations: 0, watchMinutes: 0, guestPageviews: 0, guestWatchMinutes: 0 },
        ]),
      );
      for (const r of rolled) {
        const p = points.get(r.day);
        if (!p) continue;
        p.pageviews += r.pageviews;
        p.visitors += r.visitors;
        p.registrations += r.registrations;
        p.watchMinutes += Math.round(r.watch / 60);
        if (r.audience === "guest") {
          p.guestPageviews += r.pageviews;
          p.guestWatchMinutes += Math.round(r.watch / 60);
        }
      }

      if (missing.length > 0) {
        const localDay = (column: string) =>
          Prisma.raw(`to_char(((${column} AT TIME ZONE 'UTC') AT TIME ZONE '${STATS_TZ}')::date, 'YYYY-MM-DD')`);
        const [[bounds], ] = await Promise.all([
          this.prisma.$queryRaw<Array<{ since: Date }>>`
            SELECT (${missing[0]}::date::timestamp AT TIME ZONE ${STATS_TZ}) AT TIME ZONE 'UTC' AS since
          `,
        ]);
        const since = bounds!.since;
        const [traffic, regs, watch] = await Promise.all([
          this.prisma.$queryRaw<Array<{ day: string; pageviews: number; guests: number; visitors: number }>>`
            SELECT ${localDay('"createdAt"')} AS day, COUNT(*)::int AS pageviews,
              COUNT(*) FILTER (WHERE "userId" IS NULL)::int AS guests, COUNT(DISTINCT "visitorId")::int AS visitors
            FROM "PageView" WHERE "createdAt" >= ${since} AND ${Prisma.raw(NOT_BOT)}
            GROUP BY 1
          `,
          this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
            SELECT ${localDay('"createdAt"')} AS day, COUNT(*)::int AS count
            FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1
          `,
          this.prisma.$queryRaw<Array<{ day: string; guest: boolean; seconds: number }>>`
            SELECT ${localDay('"startedAt"')} AS day, FALSE AS guest, COALESCE(SUM(seconds), 0)::int AS seconds
            FROM "WatchSession" WHERE "startedAt" >= ${since} GROUP BY 1
            UNION ALL
            SELECT ${localDay('"startedAt"')} AS day, TRUE AS guest, COALESCE(SUM(seconds), 0)::int AS seconds
            FROM "GuestWatchSession" WHERE "startedAt" >= ${since} GROUP BY 1
          `,
        ]);
        const open = new Set(missing);
        for (const r of traffic) {
          const p = open.has(r.day) ? points.get(r.day) : undefined;
          if (!p) continue;
          p.pageviews = r.pageviews;
          p.guestPageviews = r.guests;
          p.visitors = r.visitors;
        }
        for (const r of regs) {
          const p = open.has(r.day) ? points.get(r.day) : undefined;
          if (p) p.registrations = r.count;
        }
        for (const r of watch) {
          const p = open.has(r.day) ? points.get(r.day) : undefined;
          if (!p) continue;
          p.watchMinutes += Math.round(r.seconds / 60);
          if (r.guest) p.guestWatchMinutes += Math.round(r.seconds / 60);
        }
      }
      return days.map((d) => points.get(d)!);
    }) as Promise<AdminTimelinePoint[]>;
  }

  /** The overview's lists: top titles, pages and sources, newest accounts. */
  async overviewTop(): Promise<AdminOverviewTop> {
    return this.blockCache.wrap("top", async () => {
      const w = this.windows();
      const [topAnime, topPaths, topReferrers, recentUsers] = await Promise.all([
        this.topAnime(),
        this.prisma.$queryRaw<Array<{ path: string; count: number }>>`
          SELECT path, COUNT(*)::int AS count FROM "PageView"
          WHERE "createdAt" >= ${w.last30} AND ${Prisma.raw(NOT_BOT)}
          GROUP BY path ORDER BY count DESC LIMIT 8
        `,
        this.topReferrers(),
        this.recentUsers(),
      ]);
      return { topAnime, topPaths, topReferrers, recentUsers };
    }) as Promise<AdminOverviewTop>;
  }

  /** The numbers the Prometheus gauges report — read here, once per scrape
   *  at most every 30 seconds (see lib/metrics). */
  async gaugeSnapshot(): Promise<GaugeSnapshot> {
    const since = new Date(Date.now() - 5 * 60_000);
    const [users, proUsers, comments, active] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { proSince: { not: null } } }),
      this.prisma.comment.count(),
      this.prisma.$queryRaw<Array<{ registered: boolean; count: number }>>`
        SELECT ("userId" IS NOT NULL) AS registered, COUNT(DISTINCT "visitorId")::int AS count
        FROM "PageView"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
      `,
    ]);
    return {
      users,
      proUsers,
      comments,
      activeRegistered: active.find((r) => r.registered)?.count ?? 0,
      activeGuests: active.find((r) => !r.registered)?.count ?? 0,
    };
  }

  /**
   * The monitoring tab, read from Prometheus: every panel for one range,
   * queried in parallel and cached for 20 seconds so several admins with
   * the tab open cost one set of queries.
   */
  async monitoring(range: AdminMonitoringRange): Promise<AdminMonitoring> {
    return this.monitoringCache.wrap(range, async () => {
      const spec = RANGES[range];
      const end = Math.floor(Date.now() / 1000);
      const start = end - spec.seconds;
      const empty = (error: string): AdminMonitoring => ({
        available: false,
        error,
        range,
        targetUp: null,
        lastScrape: null,
        panels: [],
      });

      let target: { up: boolean | null; lastScrape: string | null };
      try {
        target = await this.promTarget();
      } catch (error) {
        return empty(error instanceof Error ? error.message : String(error));
      }

      const panels = await Promise.all(
        (Object.keys(PANELS) as AdminMonitoringPanel[]).map(async (id) => {
          const series = (
            await Promise.all(
              PANELS[id].map(async ({ key, query, byLabel }) => {
                const q = query.replaceAll("$w", spec.window).replaceAll("$s", spec.step);
                const result = await this.promRange(q, start, end, spec.stepSeconds).catch(() => []);
                return result.map((r) => ({
                  key: byLabel ? (r.metric[byLabel] ?? "unknown") : key,
                  points: r.values
                    .map(([t, v]) => [t, Number(v)] as [number, number])
                    .filter(([, v]) => Number.isFinite(v)),
                }));
              }),
            )
          ).flat();
          return { id, series };
        }),
      );

      return { available: true, error: null, range, targetUp: target.up, lastScrape: target.lastScrape, panels };
    });
  }

  private async promRange(query: string, start: number, end: number, step: number) {
    const url = new URL(`${this.prometheusUrl}/api/v1/query_range`);
    url.searchParams.set("query", query);
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    url.searchParams.set("step", String(step));
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const body = (await response.json()) as PromMatrix;
    if (body.status !== "success") throw new Error(body.error ?? `prometheus ${response.status}`);
    return body.data?.result ?? [];
  }

  /** Is Prometheus reachable, and does it see the API as up? */
  private async promTarget(): Promise<{ up: boolean | null; lastScrape: string | null }> {
    const response = await fetch(`${this.prometheusUrl}/api/v1/targets?state=active`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      throw new Error(`Prometheus is not reachable at ${this.prometheusUrl}`);
    });
    if (!response.ok) throw new Error(`Prometheus answered ${response.status}`);
    const body = (await response.json()) as {
      data?: { activeTargets?: Array<{ labels: Record<string, string>; health: string; lastScrape: string }> };
    };
    const target = body.data?.activeTargets?.find((t) => t.labels.job === "animeshadow-api");
    if (!target) return { up: null, lastScrape: null };
    return { up: target.health === "up", lastScrape: target.lastScrape };
  }

  private async topReferrers(): Promise<AdminOverviewTop["topReferrers"]> {
    const groups = await this.prisma.user.groupBy({
      by: ["referrer"],
      _count: { _all: true },
    });
    const byHost = new Map<string, number>();
    for (const g of groups) {
      const host = referrerHost(g.referrer);
      byHost.set(host, (byHost.get(host) ?? 0) + g._count._all);
    }
    return [...byHost.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([host, count]) => ({ host, count }));
  }

  /**
   * The most-opened titles of the last 30 days, counted from title-page
   * views of both audiences, with player time split the same way. Topped
   * up from the all-time view counter when there isn't a month of traffic.
   */
  private async topAnime(): Promise<AdminOverviewTop["topAnime"]> {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const recent = await this.prisma.$queryRaw<Array<{ id: number; registered: number; guests: number }>>`
      SELECT
        (substring(path from ${ANIME_PATH}))::int AS id,
        COUNT(*) FILTER (WHERE "userId" IS NOT NULL)::int AS registered,
        COUNT(*) FILTER (WHERE "userId" IS NULL)::int AS guests
      FROM "PageView"
      WHERE "createdAt" >= ${since} AND path ~ ${ANIME_PATH}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 12
    `;
    const ids = recent.map((r) => r.id);
    if (ids.length < 12) {
      const extra = await this.prisma.anime.findMany({
        where: { viewCount: { gt: 0 }, id: { notIn: ids } },
        orderBy: { viewCount: "desc" },
        take: 12 - ids.length,
        select: { id: true },
      });
      ids.push(...extra.map((e) => e.id));
    }
    if (ids.length === 0) return [];

    const [rows, pairs, regWatch, guestWatch] = await Promise.all([
      this.prisma.anime.findMany({ where: { id: { in: ids } }, include: ANIME_WITH_GENRES_INCLUDE }),
      this.prisma.watchSession.groupBy({
        by: ["animeId", "userId"],
        where: { animeId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.watchSession.groupBy({
        by: ["animeId"],
        where: { animeId: { in: ids }, startedAt: { gte: since } },
        _sum: { seconds: true },
      }),
      this.prisma.guestWatchSession.groupBy({
        by: ["animeId"],
        where: { animeId: { in: ids }, startedAt: { gte: since } },
        _sum: { seconds: true },
      }),
    ]);
    const watchers = new Map<number, number>();
    for (const p of pairs) watchers.set(p.animeId, (watchers.get(p.animeId) ?? 0) + 1);
    const regSeconds = new Map(regWatch.map((r) => [r.animeId, r._sum.seconds ?? 0]));
    const guestSeconds = new Map(guestWatch.map((r) => [r.animeId, r._sum.seconds ?? 0]));
    const recentById = new Map(recent.map((r) => [r.id, r]));
    const byId = new Map(rows.map((r) => [r.id, r]));

    return ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row != null)
      .map((row) => ({
        anime: toSummaryDto(row),
        views: row.viewCount,
        watchers: watchers.get(row.id) ?? 0,
        viewsRegistered: recentById.get(row.id)?.registered ?? 0,
        viewsGuests: recentById.get(row.id)?.guests ?? 0,
        watchSecondsRegistered: regSeconds.get(row.id) ?? 0,
        watchSecondsGuests: guestSeconds.get(row.id) ?? 0,
      }));
  }

  private async recentUsers(): Promise<AdminOverviewTop["recentUsers"]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, displayName: true, avatarUrl: true, telegramId: true, createdAt: true },
    });
    return rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      hasTelegram: u.telegramId != null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  // -- users ---------------------------------------------------------------

  async listUsers(query: AdminUserQuery): Promise<Paginated<AdminUserSummary>> {
    const where: Prisma.UserWhereInput = {
      ...(query.query
        ? {
            OR: [
              { email: { contains: query.query, mode: "insensitive" } },
              { displayName: { contains: query.query, mode: "insensitive" } },
              { username: { contains: query.query, mode: "insensitive" } },
              { id: query.query },
            ],
          }
        : {}),
      ...(query.role !== "all" ? { role: query.role } : {}),
      ...(query.status === "banned"
        ? { isBanned: true }
        : query.status === "active"
          ? { isBanned: false }
          : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      query.sort === "oldest"
        ? [{ createdAt: "asc" }]
        : query.sort === "name"
          ? [{ displayName: "asc" }]
          : query.sort === "lastSeen"
            ? [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
            : query.sort === "comments"
              ? [{ comments: { _count: "desc" } }, { createdAt: "desc" }]
              : query.sort === "library"
                ? [{ library: { _count: "desc" } }, { createdAt: "desc" }]
                : [{ createdAt: "desc" }];
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: query.perPage,
        select: USER_SUMMARY_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    const watched = await this.watchSecondsFor(rows.map((r) => r.id));
    return paginated(rows.map((r) => toUserSummary(r, watched.get(r.id) ?? 0)), {
      page: query.page,
      perPage: query.perPage,
      total,
      hasNextPage: skip + rows.length < total,
    });
  }

  /** Refuses a change that would remove the caller's own admin role — the
   * only way to get locked out of /admin would be to demote yourself with
   * no one else around to undo it. */
  async updateUser(
    callerId: string,
    targetId: string,
    input: AdminUpdateUserInput,
  ): Promise<AdminUserSummary> {
    if (callerId === targetId && (input.role === "USER" || input.isBanned === true)) {
      throw new BadRequestError("You can't remove your own admin access.");
    }

    const user = await this.prisma.user
      .update({
        where: { id: targetId },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isBanned !== undefined ? { isBanned: input.isBanned } : {}),
          ...(input.bonusXp !== undefined ? { bonusXp: input.bonusXp } : {}),
        },
        select: USER_SUMMARY_SELECT,
      })
      .catch(() => null);
    if (!user) throw new NotFoundError("User not found.");
    // A ban ends every session the account had; lifting it lets new ones in.
    if (input.isBanned === true) await revokeSessions(this.prisma, targetId);
    else if (input.isBanned === false) forgetSession(targetId);
    if (input.bonusXp !== undefined) {
      this.logger?.info({ adminId: callerId, userId: targetId, bonusXp: input.bonusXp }, "admin set a user's bonus experience");
    }
    const watched = await this.watchSecondsFor([user.id]);
    return toUserSummary(user, watched.get(user.id) ?? 0);
  }

  /**
   * Sets a new password for someone else's account — they can sign in with
   * it straight away, with their email. Hashed exactly as at signup; the
   * plain text is never stored or logged. The change itself is logged,
   * with who made it.
   */
  async setPassword(callerId: string, targetId: string, password: string): Promise<{ loginEmail: string }> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { email: true } });
    if (!target) throw new NotFoundError("User not found.");
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: targetId }, data: { passwordHash } });
    // Whoever was signed in with the old password is signed out.
    await revokeSessions(this.prisma, targetId);
    this.logger?.info({ adminId: callerId, userId: targetId }, "admin set a user's password");
    return { loginEmail: target.email };
  }

  private async watchSecondsFor(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.watchSession.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum: { seconds: true },
    });
    return new Map(rows.map((r) => [r.userId, r._sum.seconds ?? 0]));
  }

  /** Everything about one account, for the admin user view. */
  async userDetail(id: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SUMMARY_SELECT,
        bannerUrl: true,
        bio: true,
        onlineStatus: true,
        emailVerifiedAt: true,
        birthDate: true,
        referrer: true,
        _count: { select: { comments: true, library: true, achievements: true } },
      },
    });
    if (!user) throw new NotFoundError("User not found.");

    const now = new Date();
    const since = new Date(startOfUtcDay(now).getTime() - (TIMELINE_DAYS - 1) * DAY_MS);

    const [
      pageviews,
      views30,
      recentPages,
      watchTotals,
      sessions30,
      topWatched,
      byStatus,
      recentLibrary,
      commentStats,
      deletedComments,
      recentComments,
    ] = await Promise.all([
      this.prisma.pageView.count({ where: { userId: id } }),
      this.prisma.pageView.findMany({
        where: { userId: id, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.pageView.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { path: true, createdAt: true },
      }),
      this.prisma.watchSession.aggregate({ where: { userId: id }, _sum: { seconds: true }, _count: true }),
      this.prisma.watchSession.findMany({
        where: { userId: id, startedAt: { gte: since } },
        select: { startedAt: true, seconds: true },
      }),
      this.prisma.watchSession.groupBy({
        by: ["animeId"],
        where: { userId: id },
        _sum: { seconds: true },
        orderBy: { _sum: { seconds: "desc" } },
        take: 5,
      }),
      this.prisma.libraryEntry.groupBy({ by: ["status"], where: { userId: id }, _count: true }),
      this.prisma.libraryEntry.findMany({
        where: { userId: id },
        orderBy: { updatedAt: "desc" },
        take: 12,
        include: { anime: { select: { slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true } } },
      }),
      this.prisma.comment.aggregate({ where: { userId: id }, _sum: { likeCount: true } }),
      this.prisma.comment.count({ where: { userId: id, deletedAt: { not: null } } }),
      this.prisma.comment.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { anime: { select: { slug: true, title: true, titleLocalized: true } } },
      }),
    ]);

    const topIds = topWatched.map((w) => w.animeId);
    const topRows = topIds.length
      ? await this.prisma.anime.findMany({
          where: { id: { in: topIds } },
          select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true },
        })
      : [];
    const topById = new Map(topRows.map((a) => [a.id, a]));

    // 30 zero-filled days of pageviews and watch minutes.
    const dayKey = (d: Date) => startOfUtcDay(d).toISOString().slice(0, 10);
    const days = new Map<string, { pageviews: number; watchSeconds: number }>();
    for (let i = 0; i < TIMELINE_DAYS; i++) {
      days.set(dayKey(new Date(since.getTime() + i * DAY_MS)), { pageviews: 0, watchSeconds: 0 });
    }
    for (const v of views30) {
      const d = days.get(dayKey(v.createdAt));
      if (d) d.pageviews += 1;
    }
    for (const w of sessions30) {
      const d = days.get(dayKey(w.startedAt));
      if (d) d.watchSeconds += w.seconds;
    }
    const daily = [...days.entries()].map(([date, d]) => ({
      date,
      pageviews: d.pageviews,
      watchMinutes: Math.round(d.watchSeconds / 60),
    }));

    const statusCounts = new Map(byStatus.map((r) => [r.status, r._count]));
    const watchSeconds = watchTotals._sum.seconds ?? 0;

    return {
      user: {
        ...toUserSummary(user, watchSeconds),
        loginEmail: user.email,
        bannerUrl: user.bannerUrl,
        bio: user.bio,
        onlineStatus: user.onlineStatus,
        emailVerified: user.emailVerifiedAt != null,
        proSince: user.proSince?.toISOString() ?? null,
        ageVerified: user.birthDate != null,
        referrer: user.referrer,
        achievements: user._count.achievements,
      },
      activity: {
        pageviews,
        pageviews30d: views30.length,
        activeDays30d: daily.filter((d) => d.pageviews > 0 || d.watchMinutes > 0).length,
        daily,
        recentPages: recentPages.map((p) => ({ path: p.path, createdAt: p.createdAt.toISOString() })),
      },
      watch: {
        seconds: watchSeconds,
        sessions: watchTotals._count,
        topAnime: topWatched.flatMap((w) => {
          const a = topById.get(w.animeId);
          return a
            ? [{
                animeId: a.id,
                slug: a.slug,
                title: a.titleLocalized ?? a.title,
                imageUrl: a.imageUrl,
                seconds: w._sum.seconds ?? 0,
              }]
            : [];
        }),
      },
      library: {
        byStatus: ADMIN_LIBRARY_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
        recent: recentLibrary.map((e) => ({
          animeId: e.animeId,
          slug: e.anime.slug,
          title: e.anime.titleLocalized ?? e.anime.title,
          imageUrl: e.anime.imageUrl,
          status: e.status,
          score: e.score,
          progress: e.progress,
          episodes: e.anime.episodes,
          updatedAt: e.updatedAt.toISOString(),
        })),
      },
      comments: {
        total: user._count.comments,
        deleted: deletedComments,
        likesReceived: commentStats._sum.likeCount ?? 0,
        recent: recentComments.map((c) => ({
          id: c.id,
          animeSlug: c.anime.slug,
          animeTitle: c.anime.titleLocalized ?? c.anime.title,
          body: c.body,
          likeCount: c.likeCount,
          deleted: c.deletedAt != null,
          createdAt: c.createdAt.toISOString(),
        })),
      },
    };
  }

  // -- comments ------------------------------------------------------------

  async listComments(query: AdminCommentQuery): Promise<Paginated<AdminCommentSummary>> {
    const where: Prisma.CommentWhereInput = {
      ...(query.animeId ? { animeId: query.animeId } : {}),
      ...(query.query ? { body: { contains: query.query, mode: "insensitive" } } : {}),
      ...(query.status === "active"
        ? { deletedAt: null }
        : query.status === "deleted"
          ? { deletedAt: { not: null } }
          : query.status === "reported"
            ? { deletedAt: null, reports: { some: { status: "OPEN" } } }
            : {}),
    };
    const orderBy: Prisma.CommentOrderByWithRelationInput[] =
      query.sort === "oldest"
        ? [{ createdAt: "asc" }]
        : query.sort === "top"
          ? [{ likeCount: "desc" }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }];
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy,
        skip,
        take: query.perPage,
        include: {
          user: { select: CONTENT_AUTHOR_SELECT },
          anime: { select: CONTENT_ANIME_SELECT },
          reports: { where: { status: "OPEN" }, select: { reason: true } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);
    const reasons = (list: { reason: string }[]) => {
      const n = new Map<string, number>();
      for (const r of list) n.set(r.reason, (n.get(r.reason) ?? 0) + 1);
      return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
    };

    const items: AdminCommentSummary[] = rows.map((c) => ({
      id: c.id,
      animeId: c.animeId,
      animeSlug: c.anime.slug,
      animeTitle: c.anime.titleLocalized ?? c.anime.title,
      animeImageUrl: c.anime.imageUrl,
      authorId: c.user.id,
      authorName: c.user.displayName,
      authorAvatarUrl: c.user.avatarUrl,
      body: c.body,
      mode: c.mode,
      likeCount: c.likeCount,
      dislikeCount: c.dislikeCount,
      deleted: c.deletedAt != null,
      createdAt: c.createdAt.toISOString(),
      reports: c.reports.length,
      reportReasons: reasons(c.reports),
    }));

    return paginated(items, {
      page: query.page,
      perPage: query.perPage,
      total,
      hasNextPage: skip + rows.length < total,
    });
  }

  // ---- complaints about profiles ----

  /**
   * Complaints, one card per reported profile, the most recently reported
   * first: the profile as it is now, every complaint under the filter, how
   * many are still open and the last decision taken.
   */
  async listReports(query: AdminReportQuery): Promise<Paginated<AdminReportGroup>> {
    const status: ReportStatus | null =
      query.status === "open" ? "OPEN" : query.status === "resolved" ? "RESOLVED" : query.status === "dismissed" ? "DISMISSED" : null;
    const where: Prisma.ProfileReportWhereInput = status ? { status } : {};
    const skip = (query.page - 1) * query.perPage;

    const [groups, totalRows] = await Promise.all([
      this.prisma.profileReport.groupBy({
        by: ["targetId"],
        where,
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: "desc" } },
        skip,
        take: query.perPage,
      }),
      this.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(DISTINCT "targetId") AS n FROM "ProfileReport"
        WHERE ${status ? Prisma.sql`"status" = ${status}` : Prisma.sql`TRUE`}
      `,
    ]);
    const total = Number(totalRows[0]?.n ?? 0);
    const ids = groups.map((g) => g.targetId);
    if (ids.length === 0) return paginated([], { page: query.page, perPage: query.perPage, total, hasNextPage: false });

    const person = { id: true, displayName: true, username: true, avatarUrl: true } satisfies Prisma.UserSelect;
    const [targets, reports, open, decided] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { ...person, bannerUrl: true, bio: true, isBanned: true, role: true, createdAt: true },
      }),
      this.prisma.profileReport.findMany({
        where: { ...where, targetId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, targetId: true, reason: true, comment: true, status: true, createdAt: true, reporter: { select: person } },
      }),
      this.prisma.profileReport.groupBy({ by: ["targetId"], where: { targetId: { in: ids }, status: "OPEN" }, _count: { _all: true } }),
      this.prisma.profileReport.findMany({
        where: { targetId: { in: ids }, status: { not: "OPEN" } },
        orderBy: { resolvedAt: "desc" },
        distinct: ["targetId"],
        select: { targetId: true, status: true, measures: true, note: true, resolvedAt: true, moderator: { select: { displayName: true } } },
      }),
    ]);

    const items: AdminReportGroup[] = groups.flatMap((g) => {
      const target = targets.find((t) => t.id === g.targetId);
      if (!target) return [];
      const mine = reports.filter((r) => r.targetId === g.targetId);
      const byReason = new Map<ReportReason, number>();
      for (const r of mine) byReason.set(r.reason as ReportReason, (byReason.get(r.reason as ReportReason) ?? 0) + 1);
      const last = decided.find((d) => d.targetId === g.targetId);
      return [
        {
          target: { ...target, createdAt: target.createdAt.toISOString() },
          open: open.find((o) => o.targetId === g.targetId)?._count._all ?? 0,
          total: mine.length,
          reasons: [...byReason].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
          lastAt: (g._max.createdAt ?? new Date()).toISOString(),
          reports: mine.slice(0, 20).map((r) => ({
            id: r.id,
            reason: r.reason as ReportReason,
            comment: r.comment,
            status: r.status as ReportStatus,
            createdAt: r.createdAt.toISOString(),
            reporter: r.reporter,
          })),
          decision: last
            ? {
                status: last.status as "RESOLVED" | "DISMISSED",
                measures: last.measures as ReportMeasure[],
                note: last.note,
                at: (last.resolvedAt ?? new Date()).toISOString(),
                by: last.moderator?.displayName ?? null,
              }
            : null,
        },
      ];
    });

    return paginated(items, { page: query.page, perPage: query.perPage, total, hasNextPage: skip + groups.length < total });
  }

  /**
   * A decision about a reported profile: dismiss, or take measures — clear
   * its picture, cover or description, take down what it wrote on walls,
   * ban it. Closes every open complaint about it at once.
   */
  async resolveReports(callerId: string, targetId: string, input: AdminResolveReportsInput): Promise<AdminResolveReportsResult> {
    const open = await this.prisma.profileReport.count({ where: { targetId, status: "OPEN" } });
    if (open === 0) throw new NotFoundError("No open complaints about this profile.");
    const measures = input.action === "resolve" ? [...new Set(input.measures)] : [];
    if (measures.includes("ban") && callerId === targetId) throw new BadRequestError("You can't ban yourself.");

    const profile: Prisma.UserUpdateInput = {
      ...(measures.includes("avatar") ? { avatarUrl: null } : {}),
      ...(measures.includes("banner") ? { bannerUrl: null } : {}),
      ...(measures.includes("bio") ? { bio: null } : {}),
      ...(measures.includes("ban") ? { isBanned: true } : {}),
    };
    const now = new Date();
    const steps: Prisma.PrismaPromise<unknown>[] = [];
    if (Object.keys(profile).length > 0) steps.push(this.prisma.user.update({ where: { id: targetId }, data: profile }));
    if (measures.includes("wall")) {
      steps.push(this.prisma.wallPost.updateMany({ where: { authorId: targetId, deletedAt: null }, data: { deletedAt: now } }));
    }
    const results = await this.prisma.$transaction([
      ...steps,
      this.prisma.profileReport.updateMany({
        where: { targetId, status: "OPEN" },
        data: {
          status: input.action === "resolve" ? "RESOLVED" : "DISMISSED",
          measures,
          note: input.note?.trim() || null,
          moderatorId: callerId,
          resolvedAt: now,
        },
      }),
    ]);
    const closed = results[results.length - 1] as Prisma.BatchPayload;
    // A ban ends every session the account had.
    if (measures.includes("ban")) await revokeSessions(this.prisma, targetId);
    this.logger?.info({ adminId: callerId, userId: targetId, action: input.action, measures }, "admin decided on profile complaints");
    return { closed: closed.count };
  }
}
