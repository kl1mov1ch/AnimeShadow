import { Prisma, type PrismaClient } from "@animeshadow/db";

export interface StatsRollupServiceDeps {
  prisma: PrismaClient;
  logger: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
  /** Raw page views and guest watch sessions are kept this many days. */
  rawDays: number;
}

/** The admin's days are Moscow days. */
export const STATS_TZ = "Europe/Moscow";
const DAY_MS = 86_400_000;
/** Crawler page views are only looked at fresh; they go after two weeks. */
const BOT_DAYS = 14;
/** A browser not seen for this long counts as new again. */
const FIRST_SEEN_DAYS = 400;
const CHUNK = 5_000;

const NOT_BOT = Prisma.sql`(device IS NULL OR device <> 'bot')`;
const HOST = "^https?://(?:www\\.)?([^/:?#]+)";

/**
 * Keeps the statistics small without losing the history.
 *
 * Each finished day is rolled up — the day's totals per audience (StatDay)
 * and its top pages, sections, titles, sources, devices and most-watched
 * titles (StatDayKey) — and the raw rows behind it are deleted once they
 * are older than `rawDays` (90 by default), in small chunks. A day is only
 * ever pruned after it has been rolled up. Rolling up is idempotent: the
 * last two days are redone on every run, so a "left the page" beacon that
 * arrived after midnight still lands in its day.
 *
 * Also clears what nothing reads any more: sign-up codes and pending
 * registrations a day after they expired, and crawler page views after two
 * weeks.
 */
export class StatsRollupService {
  private readonly prisma: PrismaClient;
  private readonly logger: StatsRollupServiceDeps["logger"];
  private readonly rawDays: number;
  private running = false;

  constructor(deps: StatsRollupServiceDeps) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.rawDays = deps.rawDays;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const started = Date.now();
    try {
      const days = await this.rollup();
      const pruned = await this.prune();
      this.logger.info({ days, pruned, ms: Date.now() - started }, "stats rollup done");
    } catch (error) {
      this.logger.warn({ error }, "stats rollup failed");
    } finally {
      this.running = false;
    }
  }

  // -- rolling up ----------------------------------------------------------

  /** Every finished day not rolled up yet, and the last two again. */
  private async rollup(): Promise<number> {
    const [state] = await this.prisma.$queryRaw<Array<{ last: string | null; first: Date | null; today: string }>>`
      SELECT
        (SELECT to_char(MAX(day), 'YYYY-MM-DD') FROM "StatDay") AS last,
        (SELECT MIN("createdAt") FROM "PageView") AS first,
        to_char((now() AT TIME ZONE ${STATS_TZ})::date, 'YYYY-MM-DD') AS today
    `;
    if (!state) return 0;
    const firstDay = state.first ? zoneDay(state.first) : null;
    let day = state.last ? shiftDay(state.last, -1) : firstDay;
    if (!day) return 0;
    if (firstDay && day < firstDay) day = firstDay;
    let count = 0;
    for (; day < state.today && count < 800; day = shiftDay(day, 1), count++) {
      await this.rollupDay(day);
    }
    return count;
  }

  private async rollupDay(day: string): Promise<void> {
    const [bounds] = await this.prisma.$queryRaw<Array<{ f: Date; t: Date }>>`
      SELECT
        (${day}::date::timestamp AT TIME ZONE ${STATS_TZ}) AT TIME ZONE 'UTC' AS f,
        ((${day}::date + 1)::timestamp AT TIME ZONE ${STATS_TZ}) AT TIME ZONE 'UTC' AS t
    `;
    if (!bounds) return;
    const { f, t } = bounds;
    const d = Prisma.sql`${day}::date`;
    const pv = Prisma.sql`pv AS (
      SELECT * FROM "PageView" WHERE "createdAt" >= ${f} AND "createdAt" < ${t} AND ${NOT_BOT}
    )`;
    const top = (dim: string, key: Prisma.Sql, limit: number, where: Prisma.Sql = Prisma.empty) =>
      this.prisma.$executeRaw`
        WITH ${pv}
        INSERT INTO "StatDayKey" (day, dim, key, views, uniques)
        SELECT ${d}, ${dim}, k, views, uniques FROM (
          SELECT ${key} AS k, COUNT(*)::int AS views, COUNT(DISTINCT "visitorId")::int AS uniques
          FROM pv WHERE TRUE ${where}
          GROUP BY 1 ORDER BY views DESC LIMIT ${limit}
        ) x WHERE k IS NOT NULL
      `;

    await this.prisma.$transaction([
      this.prisma.$executeRaw`DELETE FROM "StatDayKey" WHERE day = ${d}`,
      this.prisma.$executeRaw`DELETE FROM "StatDay" WHERE day = ${d}`,
      // Totals per audience. A session (a run of views with no gap over
      // 30 minutes) belongs to "registered" if it was signed in at any point.
      this.prisma.$executeRaw`
        WITH ${pv},
        marked AS (
          SELECT "visitorId", "userId", "createdAt", "durationMs",
            CASE WHEN LAG("createdAt") OVER w IS NULL OR "createdAt" - LAG("createdAt") OVER w > interval '30 minutes'
              THEN 1 ELSE 0 END AS start
          FROM pv WINDOW w AS (PARTITION BY "visitorId" ORDER BY "createdAt")
        ),
        sv AS (
          SELECT *, SUM(start) OVER (PARTITION BY "visitorId" ORDER BY "createdAt" ROWS UNBOUNDED PRECEDING) AS sid
          FROM marked
        ),
        sessions AS (
          SELECT
            CASE WHEN bool_or("userId" IS NOT NULL) THEN 'registered' ELSE 'guest' END AS aud,
            COUNT(*) AS n,
            GREATEST(EXTRACT(EPOCH FROM MAX("createdAt") - MIN("createdAt")), COALESCE(SUM("durationMs"), 0) / 1000.0) AS dur
          FROM sv GROUP BY "visitorId", sid
        ),
        views AS (
          SELECT
            CASE WHEN pv."userId" IS NULL THEN 'guest' ELSE 'registered' END AS aud,
            COUNT(*)::int AS pageviews,
            COUNT(DISTINCT pv."visitorId")::int AS visitors,
            COUNT(DISTINCT pv."visitorId") FILTER (WHERE f."firstAt" >= ${f})::int AS fresh
          FROM pv LEFT JOIN "VisitorFirstSeen" f USING ("visitorId")
          GROUP BY 1
        ),
        s AS (
          SELECT aud, COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE n = 1)::int AS bounces, COALESCE(SUM(dur), 0)::int AS sec
          FROM sessions GROUP BY aud
        )
        INSERT INTO "StatDay" (day, audience, pageviews, visitors, sessions, bounces, "sessionSec", "newVisitors")
        SELECT ${d}, a.aud, COALESCE(v.pageviews, 0), COALESCE(v.visitors, 0), COALESCE(s.sessions, 0),
          COALESCE(s.bounces, 0), COALESCE(s.sec, 0), COALESCE(v.fresh, 0)
        FROM (VALUES ('registered'), ('guest')) AS a(aud)
        LEFT JOIN views v USING (aud)
        LEFT JOIN s USING (aud)
      `,
      this.prisma.$executeRaw`
        UPDATE "StatDay" SET
          "watchSec" = x.sec, "watchSessions" = x.n,
          registrations = (SELECT COUNT(*)::int FROM "User" WHERE "createdAt" >= ${f} AND "createdAt" < ${t})
        FROM (SELECT COALESCE(SUM(seconds), 0)::int AS sec, COUNT(*)::int AS n FROM "WatchSession"
              WHERE "startedAt" >= ${f} AND "startedAt" < ${t}) x
        WHERE day = ${d} AND audience = 'registered'
      `,
      this.prisma.$executeRaw`
        UPDATE "StatDay" SET "watchSec" = x.sec, "watchSessions" = x.n
        FROM (SELECT COALESCE(SUM(seconds), 0)::int AS sec, COUNT(*)::int AS n FROM "GuestWatchSession"
              WHERE "startedAt" >= ${f} AND "startedAt" < ${t}) x
        WHERE day = ${d} AND audience = 'guest'
      `,
      // The day's tops, a bounded number of each.
      top("page", Prisma.sql`path`, 200),
      top("section", Prisma.sql`COALESCE(NULLIF(substring(path from '^/[^/?#]*'), '/'), '/')`, 50),
      top("anime", Prisma.sql`substring(path from '^/anime/([0-9]+)')`, 200),
      top("referrer", Prisma.sql`COALESCE(substring(COALESCE("sessionRef", referrer) from ${HOST}), '')`, 100, Prisma.sql`AND entry`),
      top("utm", Prisma.sql`"utmSource"`, 50, Prisma.sql`AND "utmSource" IS NOT NULL`),
      top("device", Prisma.sql`COALESCE(device, '')`, 10),
      top("browser", Prisma.sql`COALESCE(browser, '')`, 30),
      top("os", Prisma.sql`COALESCE(os, '')`, 30),
      top("lang", Prisma.sql`COALESCE(lang, '')`, 30),
      // Most-watched titles: `views` is seconds, `uniques` sessions.
      this.prisma.$executeRaw`
        INSERT INTO "StatDayKey" (day, dim, key, views, uniques)
        SELECT ${d}, 'watch', "animeId"::text, SUM(seconds)::int, COUNT(*)::int
        FROM (
          SELECT "animeId", seconds FROM "WatchSession" WHERE "startedAt" >= ${f} AND "startedAt" < ${t}
          UNION ALL
          SELECT "animeId", seconds FROM "GuestWatchSession" WHERE "startedAt" >= ${f} AND "startedAt" < ${t}
        ) w
        GROUP BY "animeId" ORDER BY 4 DESC LIMIT 200
      `,
    ]);
  }

  // -- pruning ---------------------------------------------------------------

  private async prune(): Promise<Record<string, number>> {
    const [state] = await this.prisma.$queryRaw<Array<{ rolledUntil: Date | null }>>`
      SELECT ((MAX(day) + 1)::timestamp AT TIME ZONE ${STATS_TZ}) AT TIME ZONE 'UTC' AS "rolledUntil" FROM "StatDay"
    `;
    const out: Record<string, number> = {};
    const now = Date.now();
    const rolledUntil = state?.rolledUntil?.getTime() ?? 0;
    // Never past what has been rolled up.
    const rawBefore = new Date(Math.min(now - this.rawDays * DAY_MS, rolledUntil));
    const botsBefore = new Date(Math.min(now - BOT_DAYS * DAY_MS, rolledUntil));

    out.pageViews = await this.chunked(
      (limit) => this.prisma.$executeRaw`
        DELETE FROM "PageView" WHERE id IN (SELECT id FROM "PageView" WHERE "createdAt" < ${rawBefore} LIMIT ${limit})`,
    );
    out.botViews = await this.chunked(
      (limit) => this.prisma.$executeRaw`
        DELETE FROM "PageView" WHERE id IN (
          SELECT id FROM "PageView" WHERE device = 'bot' AND "createdAt" < ${botsBefore} LIMIT ${limit})`,
    );
    out.guestWatch = await this.chunked(
      (limit) => this.prisma.$executeRaw`
        DELETE FROM "GuestWatchSession" WHERE id IN (
          SELECT id FROM "GuestWatchSession" WHERE "startedAt" < ${rawBefore} LIMIT ${limit})`,
    );
    const expired = new Date(now - DAY_MS);
    out.codes = (await this.prisma.verificationCode.deleteMany({ where: { expiresAt: { lt: expired } } })).count;
    out.pending = (await this.prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: expired } } })).count;
    out.firstSeen = await this.chunked(
      (limit) => this.prisma.$executeRaw`
        DELETE FROM "VisitorFirstSeen" WHERE "visitorId" IN (
          SELECT "visitorId" FROM "VisitorFirstSeen" WHERE "firstAt" < ${new Date(now - FIRST_SEEN_DAYS * DAY_MS)} LIMIT ${limit})`,
    );
    return out;
  }

  /** Deletes in small chunks with a pause between, so a big backlog never
   *  holds a long lock or crowds out the site's own queries. */
  private async chunked(step: (limit: number) => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const n = await step(CHUNK);
      total += n;
      if (n < CHUNK) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return total;
  }
}

/** "YYYY-MM-DD" of a moment, in the admin's zone. */
function zoneDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STATS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
}
