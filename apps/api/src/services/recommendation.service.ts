import {
  ANIME_WITH_GENRES_INCLUDE,
  type PrismaClient,
  toSummaryDto,
} from "@animeshadow/db";
import type { RecommendationResponse } from "@animeshadow/shared";
import { seededShuffle, todayKey } from "../lib/seeded-shuffle.js";
import { withContentGuard } from "../lib/content-guard.js";

export interface RecommendationServiceDeps {
  prisma: PrismaClient;
}

/**
 * Recommendations, two kinds:
 *  - the home rail ("Рекомендации для вас"): personal when signed in
 *    (explicit genre picks, else genres implied by the library), trending
 *    otherwise.
 *  - the per-title "Вам может понравиться": genre-similar to the title being
 *    viewed, gently reordered toward the viewer's own picks when known.
 * Both draw from a wider pool than they show and reshuffle it with a
 * day-keyed seed, so the same visitor sees the same picks all day but a
 * different set tomorrow — never the same handful forever.
 */
export class RecommendationService {
  private readonly prisma: PrismaClient;

  constructor(deps: RecommendationServiceDeps) {
    this.prisma = deps.prisma;
  }

  async getPreferences(userId: string): Promise<number[]> {
    const rows = await this.prisma.userGenrePreference.findMany({
      where: { userId },
      select: { genreId: true },
    });
    return rows.map((r) => r.genreId);
  }

  async setPreferences(userId: string, genreIds: number[]): Promise<number[]> {
    const requested = [...new Set(genreIds)];
    // Silently drop anything that isn't a genre we actually know about, rather
    // than 500ing on a foreign-key violation — the picker only ever offers
    // ids from GET /genres, so this only guards against a stale client.
    const known =
      requested.length > 0
        ? await this.prisma.genre.findMany({
            where: { id: { in: requested } },
            select: { id: true },
          })
        : [];
    const valid = known.map((g) => g.id);

    await this.prisma.$transaction([
      this.prisma.userGenrePreference.deleteMany({ where: { userId } }),
      ...(valid.length > 0
        ? [
            this.prisma.userGenrePreference.createMany({
              data: valid.map((genreId) => ({ userId, genreId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    return valid;
  }

  /** Genres implied by what the user has actually added to their list. */
  private async implicitGenreIds(userId: string): Promise<number[]> {
    const rows = await this.prisma.libraryEntry.findMany({
      where: { userId },
      select: { anime: { select: { genres: { select: { genreId: true } } } } },
      take: 40,
      orderBy: { updatedAt: "desc" },
    });
    const counts = new Map<number, number>();
    for (const row of rows) {
      for (const g of row.anime.genres) {
        counts.set(g.genreId, (counts.get(g.genreId) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);
  }

  async homeRail(
    userId: string | null,
    limit = 18,
    allowAdult = false,
  ): Promise<RecommendationResponse> {
    let genreIds: number[] = [];
    let basis: RecommendationResponse["basis"] = "trending";

    if (userId) {
      genreIds = await this.getPreferences(userId);
      if (genreIds.length > 0) {
        basis = "preferences";
      } else {
        genreIds = await this.implicitGenreIds(userId);
        if (genreIds.length > 0) basis = "history";
      }
    }

    const pool = await this.prisma.anime.findMany({
      where: withContentGuard(
        genreIds.length > 0
          ? { genres: { some: { genreId: { in: genreIds } } } }
          : { score: { not: null } },
        allowAdult,
      ),
      orderBy: { score: { sort: "desc", nulls: "last" } },
      take: 60,
      include: ANIME_WITH_GENRES_INCLUDE,
    });

    const key = `home:${todayKey()}:${userId ?? "anon"}`;
    const items = seededShuffle(pool, key).slice(0, limit).map(toSummaryDto);
    return { items, basis };
  }

  /** "Вам может понравиться" under a specific title. */
  async similarTo(
    animeId: number,
    genreIds: number[],
    userId: string | null,
    limit = 12,
    allowAdult = false,
  ): Promise<RecommendationResponse> {
    let pool =
      genreIds.length > 0
        ? await this.prisma.anime.findMany({
            where: withContentGuard(
              {
                genres: { some: { genreId: { in: genreIds } } },
                id: { not: animeId },
              },
              allowAdult,
            ),
            orderBy: { score: { sort: "desc", nulls: "last" } },
            take: 40,
            include: ANIME_WITH_GENRES_INCLUDE,
          })
        : [];

    // A niche genre (or a title with no genre data at all) can leave this
    // too thin to fill a rail — every anime page should show *something*
    // here, so pad out with broadly popular titles instead.
    if (pool.length < limit) {
      const exclude = new Set(pool.map((a) => a.id));
      exclude.add(animeId);
      const pad = await this.prisma.anime.findMany({
        where: withContentGuard(
          { id: { notIn: [...exclude] }, score: { not: null } },
          allowAdult,
        ),
        orderBy: [
          { members: { sort: "desc", nulls: "last" } },
          { score: { sort: "desc", nulls: "last" } },
        ],
        take: limit * 2,
        include: ANIME_WITH_GENRES_INCLUDE,
      });
      pool = [...pool, ...pad.filter((a) => !exclude.has(a.id))];
    }

    if (userId) {
      const prefs = new Set(await this.getPreferences(userId));
      if (prefs.size > 0) {
        const hit = pool.filter((a) => a.genres.some((g) => prefs.has(g.genreId)));
        const rest = pool.filter((a) => !a.genres.some((g) => prefs.has(g.genreId)));
        const key = `similar:${animeId}:${todayKey()}:${userId}`;
        const items = [
          ...seededShuffle(hit, `${key}:hit`),
          ...seededShuffle(rest, `${key}:rest`),
        ]
          .slice(0, limit)
          .map(toSummaryDto);
        return { items, basis: "preferences" };
      }
    }

    const key = `similar:${animeId}:${todayKey()}:${userId ?? "anon"}`;
    const items = seededShuffle(pool, key).slice(0, limit).map(toSummaryDto);
    return { items, basis: genreIds.length > 0 ? "genre" : "trending" };
  }
}
