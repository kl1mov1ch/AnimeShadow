 import { Prisma, type PrismaClient } from "@animeshadow/db";
import type {
  AdminAnalytics,
  AdminAnalyticsQuery,
  AdminAnalyticsRow,
  AdminAnalyticsSummary,
  AdminVisitor,
  AdminVisitorDetail,
  AdminVisitorsQuery,
  Paginated,
} from "@animeshadow/shared";
import { NotFoundError } from "../lib/errors.js";

export interface AdminAnalyticsServiceDeps {
  prisma: PrismaClient;
}

const DAY_MS = 86_400_000;
const ANIME_SLUG = "^/anime/([^/?#]+)";

/**
 * Page views with sessions worked out from the gaps: a new session starts
 * on a visitor's first view, or after 30 minutes without one — the same rule
 * the browser uses for its session id, so it also covers views recorded
 * before there was one. Adds `start` (1 on a session's first view) and
 * `sid` (the session's number for that visitor).
 */
function sessioned(where: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    marked AS (
      SELECT *,
        CASE WHEN LAG("createdAt") OVER w IS NULL OR "createdAt" - LAG("createdAt") OVER w > interval '30 minutes'
          THEN 1 ELSE 0 END AS start
      FROM "PageView" WHERE ${where}
      WINDOW w AS (PARTITION BY "visitorId" ORDER BY "createdAt")
    ),
    sv AS (
      SELECT *, SUM(start) OVER (PARTITION BY "visitorId" ORDER BY "createdAt" ROWS UNBOUNDED PRECEDING) AS sid
      FROM marked
    )`;
}
const HOST = "^https?://(?:www\\.)?([^/:?#]+)";

interface Range {
  from: Date;
  to: Date;
}

/**
 * The admin's "Аналитика" tab: visits for any period, cut by audience,
 * device and page, with the previous period of the same length beside it.
 * All of it comes from our own PageView table — anonymous visitor and
 * session ids kept by the browser, never an IP address.
 */
export class AdminAnalyticsService {
  private readonly prisma: PrismaClient;

  constructor(deps: AdminAnalyticsServiceDeps) {
    this.prisma = deps.prisma;
  }

  async analytics(query: AdminAnalyticsQuery): Promise<AdminAnalytics> {
    const range = rangeOf(query);
    const span = range.to.getTime() - range.from.getTime();
    const previousRange = { from: new Date(range.from.getTime() - span), to: range.from };
    const bucket: "hour" | "day" = span <= 2 * DAY_MS ? "hour" : "day";
    const where = this.filter(query, range);

    const [summary, previous, live, series, previousSeries, heatmap, breakdowns, retention] = await Promise.all([
      this.summary(query, range),
      this.summary(query, previousRange),
      this.live(query),
      this.series(query, range, bucket),
      this.series(query, previousRange, bucket),
      this.heatmap(where, query.tz),
      this.breakdowns(where),
      this.retention(query, range),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString(), bucket },
      summary,
      previous,
      live,
      series,
      previousSeries,
      heatmap,
      breakdowns,
      retention,
    };
  }

  // -- filters -------------------------------------------------------------

  /** The WHERE for page views in a range, with every filter of the query. */
  private filter(query: AdminAnalyticsQuery, range: Range): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`"createdAt" >= ${range.from}`, Prisma.sql`"createdAt" < ${range.to}`];
    if (query.audience === "guests") parts.push(Prisma.sql`"userId" IS NULL`);
    if (query.audience === "users") parts.push(Prisma.sql`"userId" IS NOT NULL`);
    if (query.device !== "all") parts.push(Prisma.sql`device = ${query.device}`);
    if (!query.bots) parts.push(Prisma.sql`(device IS NULL OR device <> 'bot')`);
    if (query.path) parts.push(Prisma.sql`path ILIKE ${`%${escapeLike(query.path)}%`}`);
    return Prisma.join(parts, " AND ");
  }

  // -- the numbers ---------------------------------------------------------

  private async summary(query: AdminAnalyticsQuery, range: Range): Promise<AdminAnalyticsSummary> {
    const where = this.filter(query, range);
    const [[traffic], [sessions], [fresh], registrations, watch, guestWatch] = await Promise.all([
      this.prisma.$queryRaw<Array<{ visitors: number; users: number; pageviews: number; avg_page: number | null }>>`
        SELECT
          COUNT(DISTINCT "visitorId")::int AS visitors,
          COUNT(DISTINCT "userId")::int AS users,
          COUNT(*)::int AS pageviews,
          (AVG("durationMs") FILTER (WHERE "durationMs" IS NOT NULL) / 1000.0)::float AS avg_page
        FROM "PageView" WHERE ${where}
      `,
      this.prisma.$queryRaw<Array<{ sessions: number; bounces: number; avg_session: number | null; avg_pages: number | null }>>`
        WITH ${sessioned(where)},
        s AS (
          SELECT
            COUNT(*) AS n,
            GREATEST(EXTRACT(EPOCH FROM MAX("createdAt") - MIN("createdAt")), COALESCE(SUM("durationMs"), 0) / 1000.0) AS dur
          FROM sv
          GROUP BY "visitorId", sid
        )
        SELECT
          COUNT(*)::int AS sessions,
          COUNT(*) FILTER (WHERE n = 1)::int AS bounces,
          AVG(dur)::float AS avg_session,
          AVG(n)::float AS avg_pages
        FROM s
      `,
      this.prisma.$queryRaw<Array<{ fresh: number; returning: number }>>`
        WITH seen AS (SELECT DISTINCT "visitorId" FROM "PageView" WHERE ${where}),
        first AS (
          SELECT p."visitorId", MIN(p."createdAt") AS first
          FROM "PageView" p JOIN seen USING ("visitorId")
          GROUP BY p."visitorId"
        )
        SELECT
          COUNT(*) FILTER (WHERE first >= ${range.from})::int AS fresh,
          COUNT(*) FILTER (WHERE first < ${range.from})::int AS returning
        FROM first
      `,
      this.prisma.user.count({ where: { createdAt: { gte: range.from, lt: range.to } } }),
      query.audience === "guests"
        ? Promise.resolve({ _sum: { seconds: 0 } })
        : this.prisma.watchSession.aggregate({ where: { startedAt: { gte: range.from, lt: range.to } }, _sum: { seconds: true } }),
      query.audience === "users"
        ? Promise.resolve({ _sum: { seconds: 0 } })
        : this.prisma.guestWatchSession.aggregate({ where: { startedAt: { gte: range.from, lt: range.to } }, _sum: { seconds: true } }),
    ]);
    const sessionCount = sessions?.sessions ?? 0;
    return {
      visitors: traffic?.visitors ?? 0,
      users: traffic?.users ?? 0,
      newVisitors: fresh?.fresh ?? 0,
      returningVisitors: fresh?.returning ?? 0,
      sessions: sessionCount,
      pageviews: traffic?.pageviews ?? 0,
      bounceRate: sessionCount > 0 ? (sessions?.bounces ?? 0) / sessionCount : 0,
      pagesPerSession: round(sessions?.avg_pages ?? 0, 2),
      avgSessionSec: Math.round(sessions?.avg_session ?? 0),
      avgPageSec: Math.round(traffic?.avg_page ?? 0),
      registrations,
      watchMinutes: Math.round(((watch._sum.seconds ?? 0) + (guestWatch._sum.seconds ?? 0)) / 60),
    };
  }

  private async live(query: AdminAnalyticsQuery): Promise<AdminAnalytics["live"]> {
    const now = new Date();
    const where = this.filter(query, { from: new Date(now.getTime() - 5 * 60_000), to: new Date(now.getTime() + 60_000) });
    const [row] = await this.prisma.$queryRaw<Array<{ visitors: number; pageviews: number }>>`
      SELECT COUNT(DISTINCT "visitorId")::int AS visitors, COUNT(*)::int AS pageviews
      FROM "PageView" WHERE ${where}
    `;
    return { visitors: row?.visitors ?? 0, pageviews: row?.pageviews ?? 0 };
  }

  private async series(query: AdminAnalyticsQuery, range: Range, bucket: "hour" | "day"): Promise<AdminAnalytics["series"]> {
    const where = this.filter(query, range);
    const unit = Prisma.raw(`'${bucket}'`);
    const local = Prisma.sql`(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${query.tz})`;
    const [traffic, registrations] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ at: string; visitors: number; users: number; sessions: number; pageviews: number; fresh: number }>
      >`
        WITH ${sessioned(where)},
        v AS (SELECT * FROM sv),
        first AS (
          SELECT p."visitorId", MIN(p."createdAt") AS first
          FROM "PageView" p WHERE p."visitorId" IN (SELECT DISTINCT "visitorId" FROM v)
          GROUP BY p."visitorId"
        )
        SELECT
          to_char(date_trunc(${unit}, ${local}), 'YYYY-MM-DD"T"HH24:00') AS at,
          COUNT(DISTINCT v."visitorId")::int AS visitors,
          COUNT(DISTINCT v."userId")::int AS users,
          SUM(v.start)::int AS sessions,
          COUNT(*)::int AS pageviews,
          COUNT(DISTINCT v."visitorId") FILTER (WHERE date_trunc(${unit}, first."first") = date_trunc(${unit}, v."createdAt"))::int AS fresh
        FROM v JOIN first USING ("visitorId")
        GROUP BY 1
      `,
      this.prisma.$queryRaw<Array<{ at: string; count: number }>>`
        SELECT
          to_char(date_trunc(${unit}, (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${query.tz})), 'YYYY-MM-DD"T"HH24:00') AS at,
          COUNT(*)::int AS count
        FROM "User"
        WHERE "createdAt" >= ${range.from} AND "createdAt" < ${range.to}
        GROUP BY 1
      `,
    ]);
    const byAt = new Map(traffic.map((r) => [r.at, r]));
    const regs = new Map(registrations.map((r) => [r.at, r.count]));

    // Every bucket of the period, empty ones included, in the chosen zone.
    const step = bucket === "hour" ? 3_600_000 : DAY_MS;
    const out: AdminAnalytics["series"] = [];
    const startKey = localKey(range.from, query.tz, bucket);
    let cursor = new Date(Date.parse(`${startKey}:00Z`));
    const endKey = localKey(new Date(range.to.getTime() - 1), query.tz, bucket);
    for (let guard = 0; guard < 1000; guard++) {
      const key = cursor.toISOString().slice(0, 13) + ":00";
      const row = byAt.get(key);
      out.push({
        at: key,
        visitors: row?.visitors ?? 0,
        users: row?.users ?? 0,
        newVisitors: row?.fresh ?? 0,
        sessions: row?.sessions ?? 0,
        pageviews: row?.pageviews ?? 0,
        registrations: regs.get(key) ?? 0,
      });
      if (key >= endKey) break;
      cursor = new Date(cursor.getTime() + step);
    }
    return out;
  }

  private async heatmap(where: Prisma.Sql, tz: string): Promise<AdminAnalytics["heatmap"]> {
    return this.prisma.$queryRaw<AdminAnalytics["heatmap"]>`
      SELECT
        EXTRACT(DOW FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS dow,
        EXTRACT(HOUR FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS hour,
        COUNT(*)::int AS pageviews
      FROM "PageView" WHERE ${where}
      GROUP BY 1, 2
    `;
  }

  private async breakdowns(where: Prisma.Sql): Promise<AdminAnalytics["breakdowns"]> {
    const entries = (key: Prisma.Sql, limit = 100) =>
      this.prisma.$queryRaw<Array<{ key: string | null; pageviews: number; visitors: number; avg: number | null }>>`
        WITH ${sessioned(where)}
        SELECT
          ${key} AS key,
          COUNT(*)::int AS pageviews,
          COUNT(DISTINCT "visitorId")::int AS visitors,
          (AVG("durationMs") FILTER (WHERE "durationMs" IS NOT NULL) / 1000.0)::float AS avg
        FROM sv
        WHERE start = 1
        GROUP BY 1
        ORDER BY pageviews DESC
        LIMIT ${limit}
      `.then((rows) =>
        rows.map(
          (r): AdminAnalyticsRow => ({
            key: r.key ?? "—",
            pageviews: r.pageviews,
            visitors: r.visitors,
            avgSec: r.avg == null ? null : Math.round(r.avg),
          }),
        ),
      );
    const by = (key: Prisma.Sql, extra: Prisma.Sql = Prisma.empty, limit = 100) =>
      this.prisma.$queryRaw<Array<{ key: string | null; pageviews: number; visitors: number; avg: number | null }>>`
        SELECT
          ${key} AS key,
          COUNT(*)::int AS pageviews,
          COUNT(DISTINCT "visitorId")::int AS visitors,
          (AVG("durationMs") FILTER (WHERE "durationMs" IS NOT NULL) / 1000.0)::float AS avg
        FROM "PageView"
        WHERE ${where} ${extra}
        GROUP BY 1
        ORDER BY pageviews DESC
        LIMIT ${limit}
      `.then((rows) =>
        rows.map(
          (r): AdminAnalyticsRow => ({
            key: r.key ?? "—",
            pageviews: r.pageviews,
            visitors: r.visitors,
            avgSec: r.avg == null ? null : Math.round(r.avg),
          }),
        ),
      );

    const [pages, sections, entryPages, animeRaw, referrers, utmSources, utmCampaigns, devices, browsers, os, langs, screens] =
      await Promise.all([
        by(Prisma.sql`path`, Prisma.empty, 200),
        by(Prisma.sql`COALESCE(NULLIF(substring(path from '^/[^/?#]*'), '/'), '/ (главная)')`),
        entries(Prisma.sql`path`),
        by(Prisma.sql`substring(path from ${ANIME_SLUG})`, Prisma.sql`AND path ~ ${ANIME_SLUG}`, 100),
        // The session's own referrer where we have it; older views only kept
        // the visitor's very first one.
        entries(Prisma.sql`COALESCE(substring(COALESCE("sessionRef", referrer) from ${HOST}), 'Прямые заходы')`),
        by(Prisma.sql`"utmSource"`, Prisma.sql`AND "utmSource" IS NOT NULL`),
        by(Prisma.sql`"utmCampaign"`, Prisma.sql`AND "utmCampaign" IS NOT NULL`),
        by(Prisma.sql`COALESCE(device, 'неизвестно')`),
        by(Prisma.sql`COALESCE(browser, 'неизвестно')`),
        by(Prisma.sql`COALESCE(os, 'неизвестно')`),
        by(Prisma.sql`COALESCE(lang, 'неизвестно')`),
        by(Prisma.sql`CASE
          WHEN "screenW" IS NULL THEN 'неизвестно'
          WHEN "screenW" < 480 THEN 'до 480 (телефон)'
          WHEN "screenW" < 768 THEN '480–767 (большой телефон)'
          WHEN "screenW" < 1024 THEN '768–1023 (планшет)'
          WHEN "screenW" < 1440 THEN '1024–1439 (ноутбук)'
          WHEN "screenW" < 1920 THEN '1440–1919 (монитор)'
          ELSE '1920+ (большой монитор)' END`),
      ]);

    // Anime pages by name rather than by slug.
    const keys = animeRaw.map((r) => r.key);
    const ids = keys.map((k) => Number.parseInt(k, 10)).filter((n) => Number.isFinite(n));
    const titles = keys.length
      ? await this.prisma.anime.findMany({
          where: { OR: [{ slug: { in: keys } }, { id: { in: ids } }] },
          select: { id: true, slug: true, title: true, titleLocalized: true },
        })
      : [];
    const anime = animeRaw.map((r) => {
      const hit = titles.find((a) => a.slug === r.key || String(a.id) === r.key || r.key.startsWith(`${a.id}-`));
      return { ...r, label: hit ? (hit.titleLocalized ?? hit.title) : r.key, href: `/anime/${r.key}` };
    });

    return { pages, sections, entryPages, anime, referrers, utmSources, utmCampaigns, devices, browsers, os, langs, screens };
  }

  /** Weekly cohorts by first visit: how many came back 1–4 weeks later. */
  private async retention(query: AdminAnalyticsQuery, range: Range): Promise<AdminAnalytics["retention"]> {
    const audience =
      query.audience === "guests"
        ? Prisma.sql`AND "userId" IS NULL`
        : query.audience === "users"
          ? Prisma.sql`AND "userId" IS NOT NULL`
          : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ week: string; visitors: number; w1: number; w2: number; w3: number; w4: number }>>`
      WITH first AS (
        SELECT "visitorId", date_trunc('week', MIN("createdAt")) AS week
        FROM "PageView"
        WHERE (device IS NULL OR device <> 'bot') ${audience}
        GROUP BY "visitorId"
        HAVING MIN("createdAt") >= ${range.from} AND MIN("createdAt") < ${range.to}
      ),
      activity AS (
        SELECT DISTINCT p."visitorId", f.week,
          (EXTRACT(EPOCH FROM date_trunc('week', p."createdAt") - f.week) / 604800)::int AS k
        FROM "PageView" p JOIN first f USING ("visitorId")
      )
      SELECT
        to_char(f.week, 'YYYY-MM-DD') AS week,
        COUNT(DISTINCT f."visitorId")::int AS visitors,
        COUNT(DISTINCT a."visitorId") FILTER (WHERE a.k = 1)::int AS w1,
        COUNT(DISTINCT a."visitorId") FILTER (WHERE a.k = 2)::int AS w2,
        COUNT(DISTINCT a."visitorId") FILTER (WHERE a.k = 3)::int AS w3,
        COUNT(DISTINCT a."visitorId") FILTER (WHERE a.k = 4)::int AS w4
      FROM first f LEFT JOIN activity a ON a."visitorId" = f."visitorId"
      GROUP BY f.week
      ORDER BY f.week
    `;
    return rows.map((r) => ({ week: r.week, visitors: r.visitors, returned: [r.w1, r.w2, r.w3, r.w4] }));
  }

  // -- visitors ------------------------------------------------------------

  async visitors(query: AdminVisitorsQuery): Promise<Paginated<AdminVisitor>> {
    const range = rangeOf(query);
    let where = this.filter(query, range);
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      where = Prisma.sql`${where} AND ("visitorId" ILIKE ${like} OR "userId" IN (
        SELECT id FROM "User" WHERE "displayName" ILIKE ${like} OR username ILIKE ${like} OR email ILIKE ${like}
      ))`;
    }
    const order = {
      last: Prisma.sql`last`,
      first: Prisma.sql`first`,
      pageviews: Prisma.sql`pageviews`,
      sessions: Prisma.sql`sessions`,
      time: Prisma.sql`total_sec`,
    }[query.sort];
    const dir = query.dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const offset = (query.page - 1) * query.perPage;

    const [rows, [count]] = await Promise.all([
      this.prisma.$queryRaw<VisitorRow[]>`
        SELECT
          "visitorId",
          MAX("userId") AS "userId",
          MIN("createdAt") AS first,
          MAX("createdAt") AS last,
          COUNT(*)::int AS pageviews,
          (COUNT(*) FILTER (WHERE start = 1))::int AS sessions,
          (COALESCE(SUM("durationMs"), 0) / 1000)::int AS total_sec,
          (array_agg(device ORDER BY "createdAt" DESC) FILTER (WHERE device IS NOT NULL))[1] AS device,
          (array_agg(browser ORDER BY "createdAt" DESC) FILTER (WHERE browser IS NOT NULL))[1] AS browser,
          (array_agg(os ORDER BY "createdAt" DESC) FILTER (WHERE os IS NOT NULL))[1] AS os,
          (array_agg(lang ORDER BY "createdAt" DESC) FILTER (WHERE lang IS NOT NULL))[1] AS lang,
          (array_agg(substring(COALESCE("sessionRef", referrer) from ${HOST}) ORDER BY "createdAt") FILTER (WHERE COALESCE("sessionRef", referrer) IS NOT NULL))[1] AS source
        FROM (WITH ${sessioned(where)} SELECT * FROM sv) AS sv
        GROUP BY "visitorId"
        ORDER BY ${order} ${dir} NULLS LAST, "visitorId"
        LIMIT ${query.perPage} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(DISTINCT "visitorId")::int AS total FROM "PageView" WHERE ${where}
      `,
    ]);
    const items = await this.toVisitors(rows, range.from);
    const total = count?.total ?? 0;
    return {
      items,
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        hasNextPage: offset + items.length < total,
      },
    };
  }

  async visitor(visitorId: string): Promise<AdminVisitorDetail> {
    const views = await this.prisma.pageView.findMany({
      where: { visitorId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    if (views.length === 0) throw new NotFoundError("Посетитель не найден");
    const [row] = await this.prisma.$queryRaw<VisitorRow[]>`
      SELECT
        "visitorId",
        MAX("userId") AS "userId",
        MIN("createdAt") AS first,
        MAX("createdAt") AS last,
        COUNT(*)::int AS pageviews,
        (COUNT(*) FILTER (WHERE start = 1))::int AS sessions,
        (COALESCE(SUM("durationMs"), 0) / 1000)::int AS total_sec,
        (array_agg(device ORDER BY "createdAt" DESC) FILTER (WHERE device IS NOT NULL))[1] AS device,
        (array_agg(browser ORDER BY "createdAt" DESC) FILTER (WHERE browser IS NOT NULL))[1] AS browser,
        (array_agg(os ORDER BY "createdAt" DESC) FILTER (WHERE os IS NOT NULL))[1] AS os,
        (array_agg(lang ORDER BY "createdAt" DESC) FILTER (WHERE lang IS NOT NULL))[1] AS lang,
        (array_agg(substring(COALESCE("sessionRef", referrer) from ${HOST}) ORDER BY "createdAt") FILTER (WHERE COALESCE("sessionRef", referrer) IS NOT NULL))[1] AS source
      FROM (WITH ${sessioned(Prisma.sql`"visitorId" = ${visitorId}`)} SELECT * FROM sv) AS sv
      GROUP BY "visitorId"
    `;
    const [visitor] = await this.toVisitors(row ? [row] : [], new Date(0));
    return {
      visitor: visitor!,
      views: views.map((v) => ({
        at: v.createdAt.toISOString(),
        path: v.path,
        sessionId: v.sessionId,
        entry: v.entry,
        durationSec: v.durationMs == null ? null : Math.round(v.durationMs / 1000),
        device: v.device,
        browser: v.browser,
        os: v.os,
        screenW: v.screenW,
        source: v.sessionRef ? (new RegExp(HOST).exec(v.sessionRef)?.[1] ?? v.sessionRef) : null,
        utm: [v.utmSource, v.utmMedium, v.utmCampaign].filter(Boolean).join(" / ") || null,
      })),
    };
  }

  private async toVisitors(rows: VisitorRow[], periodStart: Date): Promise<AdminVisitor[]> {
    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => id != null))];
    const visitorIds = rows.map((r) => r.visitorId);
    const [users, firsts] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, username: true, avatarUrl: true },
          })
        : [],
      visitorIds.length
        ? this.prisma.pageView.groupBy({ by: ["visitorId"], where: { visitorId: { in: visitorIds } }, _min: { createdAt: true } })
        : [],
    ]);
    const firstSeen = new Map(firsts.map((f) => [f.visitorId, f._min.createdAt]));
    return rows.map((r) => {
      const user = users.find((u) => u.id === r.userId) ?? null;
      const first = firstSeen.get(r.visitorId) ?? r.first;
      return {
        visitorId: r.visitorId,
        user,
        firstSeen: first.toISOString(),
        lastSeen: r.last.toISOString(),
        pageviews: r.pageviews,
        sessions: r.sessions,
        totalSec: r.total_sec,
        device: r.device,
        browser: r.browser,
        os: r.os,
        lang: r.lang,
        source: r.source,
        isNew: first >= periodStart,
      };
    });
  }
}

interface VisitorRow {
  visitorId: string;
  userId: string | null;
  first: Date;
  last: Date;
  pageviews: number;
  sessions: number;
  total_sec: number;
  device: string | null;
  browser: string | null;
  os: string | null;
  lang: string | null;
  source: string | null;
}

function rangeOf(query: { from?: string; to?: string }): Range {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY_MS);
  // At most two years at once, and never backwards.
  const clampedFrom = new Date(Math.max(from.getTime(), to.getTime() - 730 * DAY_MS));
  return clampedFrom < to ? { from: clampedFrom, to } : { from: new Date(to.getTime() - DAY_MS), to };
}

/** "YYYY-MM-DDTHH" of a moment in a zone, truncated to the bucket. */
function localKey(date: Date, tz: string, bucket: "hour" | "day"): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}T${bucket === "hour" ? parts.hour : "00"}`;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
