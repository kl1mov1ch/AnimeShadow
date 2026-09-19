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
  type AdminUserDetail,
  type AdminUserQuery,
  type AdminUserSummary,
  paginated,
  type Paginated,
} from "@animeshadow/shared";
import bcrypt from "bcryptjs";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

export interface AdminServiceDeps {
  prisma: PrismaClient;
  logger?: { info: (obj: unknown, msg?: string) => void };
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
    isPro: u.proSince != null,
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
  timelineStart: Date;
  last7: Date;
  last30: Date;
  last60: Date;
}

export class AdminService {
  private readonly logger: AdminServiceDeps["logger"];
  private readonly prisma: PrismaClient;

  constructor(deps: AdminServiceDeps) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
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
        },
        select: USER_SUMMARY_SELECT,
      })
      .catch(() => null);
    if (!user) throw new NotFoundError("User not found.");
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
