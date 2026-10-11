import type { Prisma, PrismaClient } from "@animeshadow/db";
import type { PageLeaveInput, PageViewInput } from "@animeshadow/shared";
import { parseUserAgent } from "../lib/user-agent.js";
import { animeViewsTotal, pageviewsTotal } from "../lib/metrics.js";

export interface AnalyticsServiceDeps {
  prisma: PrismaClient;
  logger?: { warn: (obj: unknown, msg?: string) => void };
}

/** Page views wait this long in memory before they are written together… */
const FLUSH_MS = 2_000;
/** …or until this many have piled up. */
const FLUSH_ROWS = 200;
/** Title view counters are added up for a minute, then written at once. */
const VIEWS_FLUSH_MS = 60_000;
/** "Last seen" needs minutes of precision, not a write on every click. */
const LAST_SEEN_MS = 60_000;
const ANIME_ID = /^\/anime\/(\d+)/;

type PageViewRow = Prisma.PageViewCreateManyInput & { createdAt: Date };

/**
 * The site's own visit counter, written as cheaply as it can be.
 *
 * Every route change used to be an INSERT of its own (seven index writes),
 * a "last seen" query for signed-in visitors and, on every title page, an
 * UPDATE of that title's row — including when a card was merely hovered.
 * Now views are kept in memory for two seconds and written with one
 * statement, along with the "first seen" row of any browser new to the
 * site; "left the page" timings fill in a view still waiting here, or are
 * batched the same way; "last seen" is written at most once a minute per
 * account without asking the database first; and a title's view counter
 * counts real visits to its page, added up and written once a minute,
 * without touching the title's "updated" date (the sitemap reads it).
 *
 * At most two seconds of views are lost if the process dies outright; a
 * normal shutdown writes what is waiting (close()).
 */
export class AnalyticsService {
  private readonly prisma: PrismaClient;
  private readonly logger: AnalyticsServiceDeps["logger"];
  private queue: PageViewRow[] = [];
  /** The waiting views by the browser's id for them, for "left the page". */
  private waiting = new Map<string, PageViewRow>();
  private leaves = new Map<string, { visitorId: string; durationMs: number }>();
  private animeViews = new Map<number, number>();
  private lastSeen = new Map<string, number>();
  private flushing: Promise<void> | null = null;
  private readonly timers: Array<ReturnType<typeof setInterval>> = [];

  constructor(deps: AnalyticsServiceDeps) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.timers.push(setInterval(() => void this.flush(), FLUSH_MS).unref());
    this.timers.push(setInterval(() => void this.flushAnimeViews(), VIEWS_FLUSH_MS).unref());
  }

  record(input: PageViewInput, userId?: string, userAgent?: string): void {
    const clientId = input.clientId || null;
    // A retried beacon for a view that is still waiting: already counted.
    if (clientId && this.waiting.has(clientId)) return;
    const agent = parseUserAgent(userAgent);
    const row: PageViewRow = {
      path: input.path,
      referrer: input.referrer || null,
      visitorId: input.visitorId,
      userId: userId ?? null,
      clientId,
      sessionId: input.sessionId || null,
      entry: input.entry ?? false,
      sessionRef: input.sessionRef || null,
      device: agent.device,
      browser: agent.browser,
      os: agent.os,
      lang: input.lang?.slice(0, 2).toLowerCase() || null,
      screenW: input.screenW ?? null,
      utmSource: input.utmSource || null,
      utmMedium: input.utmMedium || null,
      utmCampaign: input.utmCampaign || null,
      createdAt: new Date(),
    };
    this.queue.push(row);
    if (clientId) this.waiting.set(clientId, row);

    const audience = userId ? "registered" : "guest";
    pageviewsTotal.inc({ audience });
    const anime = ANIME_ID.exec(input.path);
    if (anime) {
      animeViewsTotal.inc({ audience });
      if (agent.device !== "bot") {
        const id = Number(anime[1]);
        this.animeViews.set(id, (this.animeViews.get(id) ?? 0) + 1);
      }
    }
    if (userId) this.touchLastSeen(userId);
    if (this.queue.length >= FLUSH_ROWS) void this.flush();
  }

  /** How long a page was looked at — filled in once, only for the browser
   *  that reported the view. */
  leave(input: PageLeaveInput): void {
    const row = this.waiting.get(input.clientId);
    if (row) {
      if (row.visitorId === input.visitorId && row.durationMs == null) row.durationMs = input.durationMs;
      return;
    }
    if (!this.leaves.has(input.clientId)) {
      this.leaves.set(input.clientId, { visitorId: input.visitorId, durationMs: input.durationMs });
    }
    if (this.leaves.size >= FLUSH_ROWS) void this.flush();
  }

  /** Writes everything waiting. Safe to call at any time; calls overlap into one. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.queue.length === 0 && this.leaves.size === 0) return Promise.resolve();
    this.flushing = this.write()
      .catch((error: unknown) => this.logger?.warn({ error }, "analytics flush failed"))
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }

  /** Stops the timers and writes what is left — on shutdown. */
  async close(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    await this.flush();
    await this.flushAnimeViews();
  }

  private async write(): Promise<void> {
    const rows = this.queue;
    this.queue = [];
    this.waiting = new Map();
    const leaves = [...this.leaves];
    this.leaves = new Map();

    if (rows.length > 0) {
      // skipDuplicates: a beacon retried after its first copy was written.
      await this.prisma.pageView.createMany({ data: rows, skipDuplicates: true });
      const first = new Map<string, Date>();
      // Crawlers get a new id on every visit; they would only fill the table.
      for (const row of rows.filter((r) => r.device !== "bot")) {
        const seen = first.get(row.visitorId);
        if (!seen || row.createdAt < seen) first.set(row.visitorId, row.createdAt);
      }
      if (first.size > 0) await this.prisma.$executeRaw`
        INSERT INTO "VisitorFirstSeen" ("visitorId", "firstAt")
        SELECT * FROM UNNEST(${[...first.keys()]}::text[], ${[...first.values()]}::timestamp(3)[])
        ON CONFLICT ("visitorId") DO NOTHING
      `;
    }
    if (leaves.length > 0) {
      await this.prisma.$executeRaw`
        UPDATE "PageView" AS p SET "durationMs" = v.d
        FROM UNNEST(
          ${leaves.map(([clientId]) => clientId)}::text[],
          ${leaves.map(([, l]) => l.visitorId)}::text[],
          ${leaves.map(([, l]) => l.durationMs)}::int[]
        ) AS v(cid, vid, d)
        WHERE p."clientId" = v.cid AND p."visitorId" = v.vid AND p."durationMs" IS NULL
      `;
    }
  }

  /** Raw SQL on purpose: Prisma's update would also move the title's
   *  `updatedAt`, which tells search engines the page changed. */
  private async flushAnimeViews(): Promise<void> {
    if (this.animeViews.size === 0) return;
    const views = [...this.animeViews];
    this.animeViews = new Map();
    await this.prisma.$executeRaw`
      UPDATE "Anime" AS a SET "viewCount" = a."viewCount" + v.n
      FROM UNNEST(${views.map(([id]) => id)}::int[], ${views.map(([, n]) => n)}::int[]) AS v(id, n)
      WHERE a.id = v.id
    `.catch((error: unknown) => this.logger?.warn({ error }, "anime view counters not written"));
  }

  private touchLastSeen(userId: string): void {
    const now = Date.now();
    if (now - (this.lastSeen.get(userId) ?? 0) < LAST_SEEN_MS) return;
    // Bounded: a map of every account ever seen would only grow.
    if (this.lastSeen.size > 50_000) this.lastSeen.clear();
    this.lastSeen.set(userId, now);
    void this.prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date(now) }, select: { id: true } })
      .catch(() => undefined);
  }
}
