import {
  ANIME_WITH_GENRES_INCLUDE,
  type Prisma,
  type PrismaClient,
  toSummaryDto,
} from "@animeshadow/db";
import {
  ADMIN_LIBRARY_STATUSES,
  type AdminCommentQuery,
  type AdminCommentSummary,
  type AdminKpi,
  type AdminOverview,
  type AdminUpdateUserInput,
  type AdminUserQuery,
  type AdminUserSummary,
  paginated,
  type Paginated,
} from "@animeshadow/shared";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

export interface AdminServiceDeps {
  prisma: PrismaClient;
}

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
  createdAt: true,
  _count: { select: { comments: true, library: true } },
} satisfies Prisma.UserSelect;

type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof USER_SUMMARY_SELECT }>;

function toUserSummary(u: UserSummaryRow): AdminUserSummary {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    role: u.role === "ADMIN" ? "ADMIN" : "USER",
    isBanned: u.isBanned,
    hasTelegram: u.telegramId != null,
    commentCount: u._count.comments,
    libraryCount: u._count.library,
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
  timelineStart: Date;
  last7: Date;
  last30: Date;
  last60: Date;
}

export class AdminService {
  private readonly prisma: PrismaClient;

  constructor(deps: AdminServiceDeps) {
    this.prisma = deps.prisma;
  }

  async overview(): Promise<AdminOverview> {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const w: Windows = {
      now,
      todayStart,
      timelineStart: new Date(todayStart.getTime() - (TIMELINE_DAYS - 1) * DAY_MS),
      last7: new Date(now.getTime() - 7 * DAY_MS),
      last30: new Date(now.getTime() - 30 * DAY_MS),
      last60: new Date(now.getTime() - 60 * DAY_MS),
    };

    const [
      kpis,
      timeline,
      hourly,
      audience,
      topReferrers,
      topPaths,
      libraryStatus,
      topGenres,
      topAnime,
      recentUsers,
      recentComments,
    ] = await Promise.all([
      this.kpis(w),
      this.timeline(w),
      this.hourly(w),
      this.audience(w),
      this.topReferrers(),
      this.topPaths(w),
      this.libraryStatus(),
      this.topGenres(),
      this.topAnime(),
      this.recentUsers(),
      this.recentComments(),
    ]);

    return {
      kpis,
      timeline,
      hourly,
      audience,
      topReferrers,
      topPaths,
      libraryStatus,
      topGenres,
      topAnime,
      recentUsers,
      recentComments,
    };
  }

  // -- overview pieces ---------------------------------------------------

  private async kpis(w: Windows): Promise<AdminOverview["kpis"]> {
    const current = { gte: w.last30 };
    const previous = { gte: w.last60, lt: w.last30 };

    const [
      usersTotal,
      usersCurrent,
      usersPrevious,
      pageviewsTotal,
      pageviewsCurrent,
      pageviewsPrevious,
      [visitors],
      watchTotal,
      watchCurrent,
      watchPrevious,
      commentsTotal,
      commentsCurrent,
      commentsPrevious,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: current } }),
      this.prisma.user.count({ where: { createdAt: previous } }),
      this.prisma.pageView.count(),
      this.prisma.pageView.count({ where: { createdAt: current } }),
      this.prisma.pageView.count({ where: { createdAt: previous } }),
      this.prisma.$queryRaw<Array<{ total: number; current: number; previous: number }>>`
        SELECT
          COUNT(DISTINCT "visitorId")::int AS total,
          COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${w.last30})::int AS current,
          COUNT(DISTINCT "visitorId") FILTER (
            WHERE "createdAt" >= ${w.last60} AND "createdAt" < ${w.last30}
          )::int AS previous
        FROM "PageView"
      `,
      this.prisma.watchSession.aggregate({ _sum: { seconds: true } }),
      this.prisma.watchSession.aggregate({
        _sum: { seconds: true },
        where: { startedAt: current },
      }),
      this.prisma.watchSession.aggregate({
        _sum: { seconds: true },
        where: { startedAt: previous },
      }),
      this.prisma.comment.count(),
      this.prisma.comment.count({ where: { createdAt: current } }),
      this.prisma.comment.count({ where: { createdAt: previous } }),
    ]);

    const kpi = (total: number, cur: number, prev: number): AdminKpi => ({
      total,
      current: cur,
      previous: prev,
    });

    return {
      users: kpi(usersTotal, usersCurrent, usersPrevious),
      visitors: kpi(visitors?.total ?? 0, visitors?.current ?? 0, visitors?.previous ?? 0),
      pageviews: kpi(pageviewsTotal, pageviewsCurrent, pageviewsPrevious),
      watchSeconds: kpi(
        watchTotal._sum.seconds ?? 0,
        watchCurrent._sum.seconds ?? 0,
        watchPrevious._sum.seconds ?? 0,
      ),
      comments: kpi(commentsTotal, commentsCurrent, commentsPrevious),
    };
  }

  private async timeline(w: Windows): Promise<AdminOverview["timeline"]> {
    const [traffic, registrations, watch] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: string; pageviews: number; visitors: number }>>`
        SELECT
          to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS pageviews,
          COUNT(DISTINCT "visitorId")::int AS visitors
        FROM "PageView"
        WHERE "createdAt" >= ${w.timelineStart}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM "User"
        WHERE "createdAt" >= ${w.timelineStart}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<Array<{ day: string; seconds: number }>>`
        SELECT
          to_char(date_trunc('day', "startedAt"), 'YYYY-MM-DD') AS day,
          COALESCE(SUM(seconds), 0)::int AS seconds
        FROM "WatchSession"
        WHERE "startedAt" >= ${w.timelineStart}
        GROUP BY 1
      `,
    ]);

    const trafficByDay = new Map(traffic.map((r) => [r.day, r]));
    const registrationsByDay = new Map(registrations.map((r) => [r.day, r.count]));
    const watchByDay = new Map(watch.map((r) => [r.day, r.seconds]));

    return Array.from({ length: TIMELINE_DAYS }, (_, i) => {
      const date = new Date(w.timelineStart.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      return {
        date,
        pageviews: trafficByDay.get(date)?.pageviews ?? 0,
        visitors: trafficByDay.get(date)?.visitors ?? 0,
        registrations: registrationsByDay.get(date) ?? 0,
        watchMinutes: Math.round((watchByDay.get(date) ?? 0) / 60),
      };
    });
  }

  private async hourly(w: Windows): Promise<AdminOverview["hourly"]> {
    const rows = await this.prisma.$queryRaw<Array<{ hour: number; count: number }>>`
      SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::int AS count
      FROM "PageView"
      WHERE "createdAt" >= ${w.last7}
      GROUP BY 1
    `;
    const byHour = new Map(rows.map((r) => [r.hour, r.count]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      pageviews: byHour.get(hour) ?? 0,
    }));
  }

  private async audience(w: Windows): Promise<AdminOverview["audience"]> {
    const [total, admins, banned, telegram, [active]] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: "ADMIN" } }),
      this.prisma.user.count({ where: { isBanned: true } }),
      this.prisma.user.count({ where: { telegramId: { not: null } } }),
      this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(DISTINCT "visitorId")::int AS count
        FROM "PageView"
        WHERE "createdAt" >= ${w.todayStart}
      `,
    ]);
    return { total, admins, banned, telegram, activeToday: active?.count ?? 0 };
  }

  private async topReferrers(): Promise<AdminOverview["topReferrers"]> {
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

  private async topPaths(w: Windows): Promise<AdminOverview["topPaths"]> {
    const groups = await this.prisma.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: w.last30 } },
      _count: { _all: true },
    });
    return groups
      .map((g) => ({ path: g.path, count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  private async libraryStatus(): Promise<AdminOverview["libraryStatus"]> {
    const groups = await this.prisma.libraryEntry.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const byStatus = new Map(groups.map((g) => [g.status, g._count._all]));
    return ADMIN_LIBRARY_STATUSES.map((status) => ({
      status,
      count: byStatus.get(status) ?? 0,
    }));
  }

  /** Genres of titles people actually put in their lists — what the
   * audience is into, as opposed to what the catalogue happens to hold. */
  private async topGenres(): Promise<AdminOverview["topGenres"]> {
    return this.prisma.$queryRaw<Array<{ name: string; count: number }>>`
      SELECT g.name AS name, COUNT(*)::int AS count
      FROM "LibraryEntry" le
      JOIN "GenreOnAnime" ga ON ga."animeId" = le."animeId"
      JOIN "Genre" g ON g.id = ga."genreId"
      GROUP BY g.name
      ORDER BY count DESC
      LIMIT 8
    `;
  }

  private async topAnime(): Promise<AdminOverview["topAnime"]> {
    const rows = await this.prisma.anime.findMany({
      where: { viewCount: { gt: 0 } },
      orderBy: { viewCount: "desc" },
      take: 12,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    if (rows.length === 0) return [];

    const pairs = await this.prisma.watchSession.groupBy({
      by: ["animeId", "userId"],
      where: { animeId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const watchers = new Map<number, number>();
    for (const p of pairs) watchers.set(p.animeId, (watchers.get(p.animeId) ?? 0) + 1);

    return rows.map((row) => ({
      anime: toSummaryDto(row),
      views: row.viewCount,
      watchers: watchers.get(row.id) ?? 0,
    }));
  }

  private async recentUsers(): Promise<AdminOverview["recentUsers"]> {
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

  private async recentComments(): Promise<AdminOverview["recentComments"]> {
    const rows = await this.prisma.comment.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        user: { select: { displayName: true, avatarUrl: true } },
        anime: { select: { title: true, titleLocalized: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      animeId: c.animeId,
      animeTitle: c.anime.titleLocalized ?? c.anime.title,
      authorName: c.mode === "ANON" ? `Аниме-ниндзя #${c.anonSeq ?? 0}` : c.user.displayName,
      authorAvatarUrl: c.mode === "ANON" ? null : c.user.avatarUrl,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
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
    const orderBy: Prisma.UserOrderByWithRelationInput =
      query.sort === "oldest"
        ? { createdAt: "asc" }
        : query.sort === "name"
          ? { displayName: "asc" }
          : { createdAt: "desc" };
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

    return paginated(rows.map(toUserSummary), {
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
        },
        select: USER_SUMMARY_SELECT,
      })
      .catch(() => null);
    if (!user) throw new NotFoundError("User not found.");
    return toUserSummary(user);
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
        include: { user: { select: CONTENT_AUTHOR_SELECT }, anime: { select: CONTENT_ANIME_SELECT } },
      }),
      this.prisma.comment.count({ where }),
    ]);

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
    }));

    return paginated(items, {
      page: query.page,
      perPage: query.perPage,
      total,
      hasNextPage: skip + rows.length < total,
    });
  }
}
