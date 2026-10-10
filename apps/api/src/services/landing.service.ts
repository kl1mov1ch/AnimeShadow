import { ANIME_WITH_GENRES_INCLUDE, type Prisma, type PrismaClient, toSummaryDto } from "@animeshadow/db";
import {
  genreSlug,
  LANDING_PER_PAGE,
  type LandingLink,
  type LandingPage,
  type LandingParams,
  landingCopy,
  landingPath,
  seasonNameRu,
  seasonOf,
  shiftSeason,
} from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere } from "../lib/content-guard.js";

export interface LandingServiceDeps {
  prisma: PrismaClient;
}

/** A title counts toward the all-time top only with this many votes. */
const TOP_MIN_VOTES = 5000;

/**
 * The landing pages ("топ аниме", "онгоинги", "аниме осени 2026", …), read
 * straight from our own catalogue — fast, and the same for the app and for
 * the HTML search engines get. Adult titles never appear on them.
 */
export class LandingService {
  private readonly prisma: PrismaClient;
  private readonly cache = new TtlCache<LandingPage | null>(10 * 60_000, 500);
  private genresCache: { at: number; rows: Array<{ id: number; name: string; animeCount: number; slug: string }> } | null = null;

  constructor(deps: LandingServiceDeps) {
    this.prisma = deps.prisma;
  }

  /** Every genre with its URL slug, most-used first. Cached for an hour. */
  async genres(): Promise<Array<{ id: number; name: string; animeCount: number; slug: string }>> {
    if (this.genresCache && Date.now() - this.genresCache.at < 60 * 60_000) return this.genresCache.rows;
    const rows = await this.prisma.genre.findMany({ select: { id: true, name: true, animeCount: true }, orderBy: { animeCount: "desc" } });
    const withSlugs = rows
      .map((g) => ({ ...g, slug: genreSlug(g.name) }))
      // Hentai is never a landing page; nameless slugs can't be one either.
      .filter((g) => g.slug && g.slug !== "hentai" && g.slug !== "erotica");
    this.genresCache = { at: Date.now(), rows: withSlugs };
    return withSlugs;
  }

  /** The landing for these params, or null when it doesn't exist (an unknown genre). */
  async page(params: LandingParams): Promise<LandingPage | null> {
    const key = landingPath({ ...params, page: params.page ?? 1 });
    return this.cache.wrap(key, () => this.build(params));
  }

  private async build(params: LandingParams): Promise<LandingPage | null> {
    const page = params.page ?? 1;
    const genres = await this.genres();
    const genre = params.kind === "genre" ? genres.find((g) => g.slug === params.genre) : undefined;
    if (params.kind === "genre" && !genre) return null;

    const byPopularity: Prisma.AnimeOrderByWithRelationInput[] = [{ members: { sort: "desc", nulls: "last" } }, { id: "asc" }];
    let where: Prisma.AnimeWhereInput;
    let orderBy = byPopularity;
    switch (params.kind) {
      case "top":
        where = { score: { not: null }, scoredBy: { gte: TOP_MIN_VOTES } };
        orderBy = [{ score: { sort: "desc", nulls: "last" } }, { id: "asc" }];
        break;
      case "popular":
        where = {};
        break;
      case "ongoing":
        where = { airing: "AIRING" };
        break;
      case "announced":
        where = { airing: "UPCOMING" };
        break;
      case "movies":
        where = { type: "MOVIE" };
        break;
      case "season":
        where = { year: params.year, season: params.season };
        break;
      case "year":
        where = { year: params.year };
        break;
      case "genre":
        where = { genres: { some: { genreId: genre!.id } } };
        break;
    }
    const filter: Prisma.AnimeWhereInput = { AND: [where, contentGuardWhere(false)] };
    const [rows, total] = await Promise.all([
      this.prisma.anime.findMany({
        where: filter,
        orderBy,
        skip: (page - 1) * LANDING_PER_PAGE,
        take: LANDING_PER_PAGE,
        include: ANIME_WITH_GENRES_INCLUDE,
      }),
      this.prisma.anime.count({ where: filter }),
    ]);

    return {
      params: { ...params, page },
      copy: landingCopy({ ...params, page }, genre?.name),
      items: rows.map(toSummaryDto),
      page,
      perPage: LANDING_PER_PAGE,
      total,
      related: this.related(params, genres),
    };
  }

  /** Where to go next from a landing: other lists, nearby seasons and years, other genres. */
  private related(params: LandingParams, genres: Array<{ name: string; slug: string }>): LandingLink[] {
    const now = seasonOf(new Date());
    const seasonLink = (s: { year: number; season: LandingParams["season"] }) => ({
      href: landingPath({ kind: "season", year: s.year, season: s.season }),
      label: `Аниме ${seasonNameRu(s.season!, "gen")} ${s.year}`,
    });
    const lists: LandingLink[] = [
      { href: "/top", label: "Топ аниме" },
      { href: "/ongoing", label: "Онгоинги" },
      { href: "/popular", label: "Популярные" },
      { href: "/movies", label: "Аниме-фильмы" },
      { href: "/announced", label: "Анонсы" },
    ];
    switch (params.kind) {
      case "season": {
        const at = { year: params.year!, season: params.season! };
        return [
          ...[-2, -1, 1].map((d) => seasonLink(shiftSeason(at, d))),
          { href: landingPath({ kind: "year", year: params.year }), label: `Аниме ${params.year} года` },
          ...lists,
        ];
      }
      case "year":
        return [
          ...(["winter", "spring", "summer", "fall"] as const).map((season) => seasonLink({ year: params.year!, season })),
          ...[-2, -1, 1].map((d) => ({ href: landingPath({ kind: "year", year: params.year! + d }), label: `Аниме ${params.year! + d} года` })),
        ].filter((l) => !l.href.includes(String(now.year + 2)));
      case "genre":
        return genres
          .filter((g) => g.slug !== params.genre)
          .slice(0, 16)
          .map((g) => ({ href: landingPath({ kind: "genre", genre: g.slug }), label: g.name }));
      default:
        return [
          ...lists.filter((l) => l.href !== `/${params.kind}`),
          seasonLink(now),
          seasonLink(shiftSeason(now, -1)),
          { href: landingPath({ kind: "year", year: now.year }), label: `Аниме ${now.year} года` },
        ];
    }
  }
}
