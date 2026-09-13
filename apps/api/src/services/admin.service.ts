import type { Prisma, PrismaClient } from "@animeshadow/db";
import {
  type AdminCommentSummary,
  type AdminContentQuery,
  type AdminOverview,
  type AdminReviewSummary,
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

export class AdminService {
  private readonly prisma: PrismaClient;

  constructor(deps: AdminServiceDeps) {
    this.prisma = deps.prisma;
  }

  async overview(): Promise<AdminOverview> {
    const now = Date.now();
    const startOfToday = new Date(now - (now % DAY_MS));
    const sevenDaysAgo = new Date(now - 7 * DAY_MS);
    const thirtyDaysAgo = new Date(now - 30 * DAY_MS);

    const [
      totalUsers,
      admins,
      newToday,
      new7d,
      new30d,
      referrerGroups,
      pageviewsToday,
      pageviews7d,
      pageviews30d,
      recentVisitors,
      topPathsRaw,
      topAnimeRows,
      watchAgg,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: "ADMIN" } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.user.groupBy({ by: ["referrer"], _count: { _all: true } }),
      this.prisma.pageView.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.pageView.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.pageView.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.pageView.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        distinct: ["visitorId"],
        select: { visitorId: true },
      }),
      this.prisma.pageView.groupBy({
        by: ["path"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
      }),
      this.prisma.anime.findMany({
        orderBy: { viewCount: "desc" },
        take: 20,
        select: { id: true, slug: true, title: true, titleLocalized: true, viewCount: true },
      }),
      this.prisma.watchSession.aggregate({
        _sum: { seconds: true },
        _count: { _all: true },
      }),
    ]);

    const hostCounts = new Map<string, number>();
    for (const g of referrerGroups) {
      const host = referrerHost(g.referrer);
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + g._count._all);
    }
    const topReferrers = [...hostCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([host, count]) => ({ host, count }));

    const topPaths = topPathsRaw
      .map((g) => ({ path: g.path, count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      users: { total: totalUsers, admins, newToday, new7d, new30d },
      topReferrers,
      traffic: {
        pageviewsToday,
        pageviews7d,
        pageviews30d,
        uniqueVisitors7d: recentVisitors.length,
        topPaths,
      },
      topAnime: topAnimeRows.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.titleLocalized ?? a.title,
        viewCount: a.viewCount,
      })),
      watch: {
        totalSeconds: watchAgg._sum.seconds ?? 0,
        sessionCount: watchAgg._count._all,
      },
    };
  }

  async listUsers(query: AdminUserQuery): Promise<Paginated<AdminUserSummary>> {
    const where: Prisma.UserWhereInput = query.query
      ? {
          OR: [
            { email: { contains: query.query, mode: "insensitive" } },
            { displayName: { contains: query.query, mode: "insensitive" } },
          ],
        }
      : {};
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: query.perPage,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isBanned: true,
          telegramId: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items: AdminUserSummary[] = rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role === "ADMIN" ? "ADMIN" : "USER",
      isBanned: u.isBanned,
      hasTelegram: u.telegramId != null,
      createdAt: u.createdAt.toISOString(),
    }));

    return paginated(items, {
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
    if (callerId === targetId && input.role === "USER") {
      throw new BadRequestError("You can't remove your own admin access.");
    }

    const user = await this.prisma.user
      .update({
        where: { id: targetId },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isBanned !== undefined ? { isBanned: input.isBanned } : {}),
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isBanned: true,
          telegramId: true,
          createdAt: true,
        },
      })
      .catch(() => null);
    if (!user) throw new NotFoundError("User not found.");

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
      isBanned: user.isBanned,
      hasTelegram: user.telegramId != null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async listComments(query: AdminContentQuery): Promise<Paginated<AdminCommentSummary>> {
    const where: Prisma.CommentWhereInput = {
      ...(query.animeId ? { animeId: query.animeId } : {}),
      ...(query.query ? { body: { contains: query.query, mode: "insensitive" } } : {}),
    };
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        skip,
        take: query.perPage,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, displayName: true } },
          anime: { select: { title: true, titleLocalized: true } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    const items: AdminCommentSummary[] = rows.map((c) => ({
      id: c.id,
      animeId: c.animeId,
      animeTitle: c.anime.titleLocalized ?? c.anime.title,
      authorId: c.user.id,
      authorName: c.user.displayName,
      body: c.body,
      mode: c.mode,
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

  async listReviews(query: AdminContentQuery): Promise<Paginated<AdminReviewSummary>> {
    const where: Prisma.ReviewWhereInput = {
      ...(query.animeId ? { animeId: query.animeId } : {}),
      ...(query.query ? { body: { contains: query.query, mode: "insensitive" } } : {}),
    };
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: query.perPage,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, displayName: true } },
          anime: { select: { title: true, titleLocalized: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const items: AdminReviewSummary[] = rows.map((r) => ({
      id: r.id,
      animeId: r.animeId,
      animeTitle: r.anime.titleLocalized ?? r.anime.title,
      authorId: r.user.id,
      authorName: r.user.displayName,
      rating: r.rating,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    }));

    return paginated(items, {
      page: query.page,
      perPage: query.perPage,
      total,
      hasNextPage: skip + rows.length < total,
    });
  }
}
