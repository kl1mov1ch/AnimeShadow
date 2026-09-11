import { type Prisma, type PrismaClient } from "@animeshadow/db";
import type { Review, ReviewList, UpsertReviewInput } from "@animeshadow/shared";
import { NotFoundError } from "../lib/errors.js";
import type { AchievementService } from "./achievement.service.js";
import type { CatalogService } from "./catalog.service.js";

export interface ReviewServiceDeps {
  prisma: PrismaClient;
  catalog: CatalogService;
  achievements?: AchievementService;
}

const REVIEW_INCLUDE = {
  user: { select: { id: true, displayName: true } },
} satisfies Prisma.ReviewInclude;

type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

export class ReviewService {
  private readonly prisma: PrismaClient;
  private readonly catalog: CatalogService;
  private readonly achievements?: AchievementService;

  constructor(deps: ReviewServiceDeps) {
    this.prisma = deps.prisma;
    this.catalog = deps.catalog;
    this.achievements = deps.achievements;
  }

  async list(animeId: number, viewerId?: string): Promise<ReviewList> {
    const [rows, agg, grouped] = await Promise.all([
      this.prisma.review.findMany({
        where: { animeId },
        orderBy: { updatedAt: "desc" },
        include: REVIEW_INCLUDE,
        take: 100,
      }),
      this.prisma.review.aggregate({
        where: { animeId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ["rating"],
        where: { animeId },
        orderBy: { rating: "asc" },
        _count: { rating: true },
      }),
    ]);

    const items = rows.map((row) => toReview(row, viewerId));
    const distribution: Record<string, number> = {};
    for (const group of grouped) {
      distribution[String(group.rating)] = group._count.rating;
    }

    return {
      items,
      summary: {
        count: agg._count._all,
        average: agg._avg.rating,
        distribution,
      },
      mine: items.find((review) => review.isMine) ?? null,
    };
  }

  async upsert(
    userId: string,
    animeId: number,
    input: UpsertReviewInput,
  ): Promise<Review> {
    await this.catalog.getAnimeById(animeId, "en");

    const row = await this.prisma.review.upsert({
      where: { userId_animeId: { userId, animeId } },
      create: { userId, animeId, rating: input.rating, body: input.body },
      update: { rating: input.rating, body: input.body },
      include: REVIEW_INCLUDE,
    });
    void this.achievements?.recompute(userId).catch(() => undefined);
    return toReview(row, userId);
  }

  async remove(userId: string, animeId: number): Promise<void> {
    const { count } = await this.prisma.review.deleteMany({
      where: { userId, animeId },
    });
    if (count === 0) {
      throw new NotFoundError("Отзыв не найден.");
    }
  }
}

function toReview(row: ReviewRow, viewerId?: string): Review {
  return {
    id: row.id,
    animeId: row.animeId,
    rating: row.rating,
    body: row.body,
    author: { id: row.user.id, displayName: row.user.displayName },
    isMine: viewerId != null && row.userId === viewerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
