import {
  ANIME_WITH_GENRES_INCLUDE,
  type Prisma,
  type PrismaClient,
  toSummaryDto,
} from "@animeshadow/db";
import {
  type AnimeSummary,
  type CollectionAuthor,
  type CollectionBlock,
  type CollectionComment,
  type CollectionCoverItem,
  type CollectionDetail,
  type CollectionInput,
  type CollectionLimit,
  type CollectionQuery,
  type CollectionStats,
  type CollectionSummary,
  type CollectionTag,
  FREE_COLLECTION_LIMIT,
  type MyCollectionsStats,
  type Paginated,
  paginated,
} from "@animeshadow/shared";
import { withContentGuard } from "../lib/content-guard.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { isProfane } from "../lib/profanity.js";

export interface CollectionServiceDeps {
  prisma: PrismaClient;
  proForAll?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Anime shown in a collection's cover. */
const COVER_SIZE = 7;

const AUTHOR_SELECT = {
  id: true,
  displayName: true,
  username: true,
  avatarUrl: true,
  proSince: true,
} satisfies Prisma.UserSelect;

type Row = Prisma.CollectionGetPayload<{ include: { user: { select: typeof AUTHOR_SELECT } } }>;

function dayOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Collections: an article about a set of anime — paragraphs and anime cards
 * interleaved, each card with the author's own note on why it's there —
 * that other people read, rate (1–5) and comment on. Views are counted once
 * per visitor per day, which is what the author's stats are built from.
 */
export class CollectionService {
  private readonly prisma: PrismaClient;
  private readonly proForAll: boolean;

  constructor(deps: CollectionServiceDeps) {
    this.prisma = deps.prisma;
    this.proForAll = deps.proForAll ?? false;
  }

  // ---------------------------------------------------------------- limits

  async limitFor(userId: string): Promise<CollectionLimit> {
    const [user, used] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { proSince: true } }),
      this.prisma.collection.count({ where: { userId } }),
    ]);
    const pro = this.proForAll || user?.proSince != null;
    return { used, max: pro ? null : FREE_COLLECTION_LIMIT };
  }

  // ---------------------------------------------------------------- write

  async create(userId: string, input: CollectionInput): Promise<CollectionDetail> {
    const limit = await this.limitFor(userId);
    if (limit.max != null && limit.used >= limit.max) {
      throw new ForbiddenError(
        `На обычном аккаунте можно вести до ${limit.max} подборок. С PRO — сколько угодно.`,
      );
    }
    this.assertClean(input);
    const blocks = await this.cleanBlocks(input.blocks);
    const row = await this.prisma.collection.create({
      data: {
        userId,
        title: input.title,
        summary: input.summary,
        tags: input.tags,
        blocks: blocks as unknown as Prisma.InputJsonValue,
        animeIds: animeIdsOf(blocks),
        published: input.published,
      },
    });
    return this.detail(row.id, userId, true);
  }

  async update(userId: string, id: string, input: CollectionInput, isAdmin = false): Promise<CollectionDetail> {
    const existing = await this.prisma.collection.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundError("Подборка не найдена.");
    if (existing.userId !== userId && !isAdmin) throw new ForbiddenError("Это не ваша подборка.");
    this.assertClean(input);
    const blocks = await this.cleanBlocks(input.blocks);
    await this.prisma.collection.update({
      where: { id },
      data: {
        title: input.title,
        summary: input.summary,
        tags: input.tags,
        blocks: blocks as unknown as Prisma.InputJsonValue,
        animeIds: animeIdsOf(blocks),
        published: input.published,
      },
    });
    return this.detail(id, userId, true);
  }

  async remove(userId: string, id: string, isAdmin = false): Promise<void> {
    const existing = await this.prisma.collection.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) return;
    if (existing.userId !== userId && !isAdmin) throw new ForbiddenError("Это не ваша подборка.");
    await this.prisma.collection.delete({ where: { id } });
  }

  // ---------------------------------------------------------------- read

  async list(query: CollectionQuery, viewerId?: string): Promise<Paginated<CollectionSummary>> {
    const where: Prisma.CollectionWhereInput = {
      published: true,
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
    };
    const orderBy: Prisma.CollectionOrderByWithRelationInput[] =
      query.sort === "new"
        ? [{ createdAt: "desc" }]
        : query.sort === "top"
          ? [{ ratingSum: "desc" }, { ratingCount: "desc" }, { createdAt: "desc" }]
          : [{ viewCount: "desc" }, { ratingSum: "desc" }, { createdAt: "desc" }];
    const [rows, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        include: { user: { select: AUTHOR_SELECT } },
      }),
      this.prisma.collection.count({ where }),
    ]);
    void viewerId;
    const items = await this.summaries(rows);
    return paginated(items, {
      page: query.page,
      perPage: query.perPage,
      total,
      hasNextPage: query.page * query.perPage < total,
    });
  }

  /** A user's collections — drafts too when it's their own. */
  async byUser(userId: string, viewerId?: string): Promise<{ items: CollectionSummary[]; limit: CollectionLimit | null }> {
    const own = viewerId === userId;
    const rows = await this.prisma.collection.findMany({
      where: { userId, ...(own ? {} : { published: true }) },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { user: { select: AUTHOR_SELECT } },
    });
    return { items: await this.summaries(rows), limit: own ? await this.limitFor(userId) : null };
  }

  async detail(id: string, viewerId?: string, isAdmin = false, allowAdult = false): Promise<CollectionDetail> {
    const row = await this.prisma.collection.findUnique({
      where: { id },
      include: { user: { select: AUTHOR_SELECT } },
    });
    if (!row) throw new NotFoundError("Подборка не найдена.");
    const own = row.userId === viewerId;
    if (!row.published && !own && !isAdmin) throw new NotFoundError("Подборка не найдена.");

    const [animeRows, mine] = await Promise.all([
      this.prisma.anime.findMany({
        where: withContentGuard({ id: { in: row.animeIds } }, allowAdult || own),
        include: ANIME_WITH_GENRES_INCLUDE,
      }),
      viewerId
        ? this.prisma.collectionRating.findUnique({
            where: { collectionId_userId: { collectionId: id, userId: viewerId } },
            select: { value: true },
          })
        : null,
    ]);
    const anime: Record<number, AnimeSummary> = {};
    for (const a of animeRows) anime[a.id] = toSummaryDto(a);
    const blocks = (row.blocks as unknown as CollectionBlock[]).filter(
      (b) => b.type === "text" || anime[b.animeId] != null,
    );
    const [summary] = await this.summaries([row], animeRows);
    return { ...summary!, blocks, anime, myRating: mine?.value ?? null, canEdit: own || isAdmin };
  }

  // ---------------------------------------------------------------- ratings

  async rate(userId: string, id: string, value: number): Promise<{ ratingAvg: number | null; ratingCount: number; myRating: number }> {
    const row = await this.prisma.collection.findUnique({ where: { id }, select: { userId: true, published: true } });
    if (!row || !row.published) throw new NotFoundError("Подборка не найдена.");
    if (row.userId === userId) throw new BadRequestError("Свою подборку оценить нельзя.");
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.collectionRating.findUnique({
        where: { collectionId_userId: { collectionId: id, userId } },
      });
      await tx.collectionRating.upsert({
        where: { collectionId_userId: { collectionId: id, userId } },
        create: { collectionId: id, userId, value },
        update: { value },
      });
      await tx.collection.update({
        where: { id },
        data: previous
          ? { ratingSum: { increment: value - previous.value } }
          : { ratingSum: { increment: value }, ratingCount: { increment: 1 } },
      });
    });
    const after = await this.prisma.collection.findUniqueOrThrow({ where: { id }, select: { ratingSum: true, ratingCount: true } });
    return { ...avg(after.ratingSum, after.ratingCount), myRating: value };
  }

  // ---------------------------------------------------------------- comments

  async comments(id: string, viewerId?: string, isAdmin = false): Promise<CollectionComment[]> {
    const collection = await this.prisma.collection.findUnique({ where: { id }, select: { userId: true } });
    if (!collection) throw new NotFoundError("Подборка не найдена.");
    const rows = await this.prisma.collectionComment.findMany({
      where: { collectionId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: AUTHOR_SELECT } },
    });
    return rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: this.author(c.user),
      canDelete: viewerId != null && (c.userId === viewerId || collection.userId === viewerId || isAdmin),
    }));
  }

  async addComment(userId: string, id: string, body: string): Promise<CollectionComment> {
    const collection = await this.prisma.collection.findUnique({ where: { id }, select: { published: true } });
    if (!collection || !collection.published) throw new NotFoundError("Подборка не найдена.");
    if (isProfane(body)) throw new BadRequestError("Комментарий не прошёл фильтр — перефразируйте, пожалуйста.");
    const [row] = await this.prisma.$transaction([
      this.prisma.collectionComment.create({
        data: { collectionId: id, userId, body },
        include: { user: { select: AUTHOR_SELECT } },
      }),
      this.prisma.collection.update({ where: { id }, data: { commentCount: { increment: 1 } } }),
    ]);
    return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), author: this.author(row.user), canDelete: true };
  }

  async removeComment(userId: string, commentId: string, isAdmin = false): Promise<void> {
    const row = await this.prisma.collectionComment.findUnique({
      where: { id: commentId },
      select: { userId: true, collectionId: true, deletedAt: true, collection: { select: { userId: true } } },
    });
    if (!row || row.deletedAt) return;
    if (row.userId !== userId && row.collection.userId !== userId && !isAdmin) {
      throw new ForbiddenError("Удалить этот комментарий нельзя.");
    }
    await this.prisma.$transaction([
      this.prisma.collectionComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } }),
      this.prisma.collection.update({ where: { id: row.collectionId }, data: { commentCount: { decrement: 1 } } }),
    ]);
  }

  // ---------------------------------------------------------------- views & stats

  /** Counted once per visitor per day; the author's own visits don't count. */
  async recordView(id: string, visitorId: string, userId?: string): Promise<void> {
    const row = await this.prisma.collection.findUnique({ where: { id }, select: { userId: true, published: true } });
    if (!row || !row.published || row.userId === userId) return;
    try {
      await this.prisma.collectionView.create({
        data: { collectionId: id, visitorId, userId: userId ?? null, day: dayOf(new Date()) },
      });
      await this.prisma.collection.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    } catch {
      // Already counted today (unique collection + visitor + day).
    }
  }

  async stats(userId: string, id: string, isAdmin = false): Promise<CollectionStats> {
    const row = await this.prisma.collection.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Подборка не найдена.");
    if (row.userId !== userId && !isAdmin) throw new ForbiddenError("Статистика доступна только автору.");
    const since = dayOf(new Date(Date.now() - 29 * DAY_MS));
    const [views, comments, ratings, unique] = await Promise.all([
      this.prisma.collectionView.groupBy({ by: ["day"], where: { collectionId: id, day: { gte: since } }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ day: string; n: number }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
        FROM "CollectionComment"
        WHERE "collectionId" = ${id} AND "deletedAt" IS NULL AND "createdAt" >= ${since}
        GROUP BY 1
      `,
      this.prisma.collectionRating.groupBy({ by: ["value"], where: { collectionId: id }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(DISTINCT "visitorId")::int AS n FROM "CollectionView"
        WHERE "collectionId" = ${id} AND "day" >= ${since}
      `,
    ]);
    const viewsBy = new Map(views.map((v) => [v.day.toISOString().slice(0, 10), v._count._all]));
    const commentsBy = new Map(comments.map((c) => [c.day, c.n]));
    const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const r of ratings) if (r.value >= 1 && r.value <= 5) dist[r.value - 1] = r._count._all;
    return {
      id: row.id,
      title: row.title,
      totals: {
        views: row.viewCount,
        uniqueVisitors30d: unique[0]?.n ?? 0,
        ...avg(row.ratingSum, row.ratingCount),
        comments: row.commentCount,
      },
      daily: Array.from({ length: 30 }, (_, i) => {
        const date = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        return { date, views: viewsBy.get(date) ?? 0, comments: commentsBy.get(date) ?? 0 };
      }),
      ratings: dist,
    };
  }

  async myStats(userId: string): Promise<MyCollectionsStats> {
    const since = dayOf(new Date(Date.now() - 29 * DAY_MS));
    const week = dayOf(new Date(Date.now() - 6 * DAY_MS));
    const [rows, limit] = await Promise.all([
      this.prisma.collection.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      this.limitFor(userId),
    ]);
    const ids = rows.map((r) => r.id);
    const [daily, weekly] = await Promise.all([
      ids.length
        ? this.prisma.collectionView.groupBy({ by: ["day"], where: { collectionId: { in: ids }, day: { gte: since } }, _count: { _all: true } })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.collectionView.groupBy({ by: ["collectionId"], where: { collectionId: { in: ids }, day: { gte: week } }, _count: { _all: true } })
        : Promise.resolve([]),
    ]);
    const dailyBy = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d._count._all]));
    const weekBy = new Map(weekly.map((w) => [w.collectionId, w._count._all]));
    const ratingSum = rows.reduce((s, r) => s + r.ratingSum, 0);
    const ratingCount = rows.reduce((s, r) => s + r.ratingCount, 0);
    return {
      limit,
      totals: {
        views: rows.reduce((s, r) => s + r.viewCount, 0),
        ratings: ratingCount,
        ratingAvg: avg(ratingSum, ratingCount).ratingAvg,
        comments: rows.reduce((s, r) => s + r.commentCount, 0),
      },
      daily: Array.from({ length: 30 }, (_, i) => {
        const date = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        return { date, views: dailyBy.get(date) ?? 0 };
      }),
      collections: rows.map((r) => ({
        id: r.id,
        title: r.title,
        published: r.published,
        views: r.viewCount,
        views7d: weekBy.get(r.id) ?? 0,
        ...avg(r.ratingSum, r.ratingCount),
        comments: r.commentCount,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------- internals

  private author(u: Row["user"]): CollectionAuthor {
    return {
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      avatarUrl: u.avatarUrl,
      isPro: this.proForAll || u.proSince != null,
    };
  }

  private async summaries(
    rows: Row[],
    known: Array<{ id: number; slug: string; title: string; titleLocalized: string | null; imageLargeUrl: string | null; imageUrl: string | null; bannerImage?: string | null }> = [],
  ): Promise<CollectionSummary[]> {
    const need = [...new Set(rows.flatMap((r) => r.animeIds.slice(0, COVER_SIZE)))].filter(
      (id) => !known.some((k) => k.id === id),
    );
    const fetched = need.length
      ? await this.prisma.anime.findMany({
          where: { id: { in: need } },
          select: { id: true, slug: true, title: true, titleLocalized: true, imageLargeUrl: true, imageUrl: true, bannerImage: true },
        })
      : [];
    const byId = new Map([...known, ...fetched].map((a) => [a.id, a]));
    return rows.map((r) => {
      const cover: CollectionCoverItem[] = r.animeIds
        .slice(0, COVER_SIZE)
        .map((id) => byId.get(id))
        .filter((a): a is NonNullable<typeof a> => a != null)
        .map((a) => ({
          id: a.id,
          slug: a.slug,
          title: a.titleLocalized ?? a.title,
          image: a.imageLargeUrl ?? a.imageUrl,
          banner: a.bannerImage ?? null,
        }));
      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        tags: r.tags as CollectionTag[],
        author: this.author(r.user),
        cover,
        animeCount: r.animeIds.length,
        published: r.published,
        viewCount: r.viewCount,
        ...avg(r.ratingSum, r.ratingCount),
        commentCount: r.commentCount,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  /** Text and notes go through the same filter as comments. */
  private assertClean(input: CollectionInput): void {
    const texts = [input.title, input.summary, ...input.blocks.map((b) => (b.type === "text" ? b.text : b.note))];
    if (texts.some((t) => t && isProfane(t))) {
      throw new BadRequestError("Текст подборки не прошёл фильтр — перефразируйте, пожалуйста.");
    }
  }

  /** Drops anime that don't exist and repeated ones (first mention wins). */
  private async cleanBlocks(blocks: CollectionBlock[]): Promise<CollectionBlock[]> {
    const ids = [...new Set(blocks.flatMap((b) => (b.type === "anime" ? [b.animeId] : [])))];
    const existing = new Set(
      (await this.prisma.anime.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((a) => a.id),
    );
    const seen = new Set<number>();
    const out: CollectionBlock[] = [];
    for (const b of blocks) {
      if (b.type === "anime") {
        if (!existing.has(b.animeId) || seen.has(b.animeId)) continue;
        seen.add(b.animeId);
      }
      out.push(b);
    }
    if (!out.some((b) => b.type === "anime")) throw new BadRequestError("Добавьте в подборку хотя бы одно аниме.");
    return out;
  }
}

function animeIdsOf(blocks: CollectionBlock[]): number[] {
  return blocks.flatMap((b) => (b.type === "anime" ? [b.animeId] : []));
}

function avg(sum: number, count: number): { ratingAvg: number | null; ratingCount: number } {
  return { ratingAvg: count > 0 ? Math.round((sum / count) * 10) / 10 : null, ratingCount: count };
}
