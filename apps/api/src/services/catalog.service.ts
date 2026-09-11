import {
  ANIME_WITH_GENRES_INCLUDE,
  type Prisma,
  type PrismaClient,
  persistAnimeDetail,
  persistAnimeSummaries,
  toDetailDto,
  toSummaryDto,
  upsertGenres,
} from "@animeshadow/db";
import type { JikanClient } from "@animeshadow/jikan";
import {
  ShikimoriError,
  type ShikimoriClient,
  toAnimeDetail as shikiToDetail,
  toAnimeSummary as shikiToSummary,
  toCharacters as shikiToCharacters,
  toGenreList as shikiToGenres,
} from "@animeshadow/shikimori";
import {
  type AnimeDetail,
  type AnimeOrderBy,
  type AnimeQuery,
  type AnimeSummary,
  type Character,
  DEFAULT_LOCALE,
  type DiscoverResponse,
  type Genre,
  type Locale,
  type Paginated,
  type RecommendationItem,
  slugify,
} from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { seededShuffle, todayKey } from "../lib/seeded-shuffle.js";
import { NotFoundError, UpstreamUnavailableError } from "../lib/errors.js";
import type { TranslationService } from "./translation.service.js";

interface CatalogLogger {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

export interface CatalogServiceDeps {
  prisma: PrismaClient;
  shikimori: ShikimoriClient;
  jikan: JikanClient;
  cacheTtlSeconds: number;
  logger: CatalogLogger;
  translation: TranslationService;
}

const CURRENT_SEASON = (() => {
  const month = new Date().getUTCMonth();
  if (month <= 1 || month === 11) return "winter" as const;
  if (month <= 4) return "spring" as const;
  if (month <= 7) return "summer" as const;
  return "fall" as const;
})();
const CURRENT_YEAR = new Date().getUTCFullYear();

const ORDER_BY_COLUMN: Record<AnimeOrderBy, keyof Prisma.AnimeOrderByWithRelationInput> = {
  score: "score",
  popularity: "members",
  rank: "score",
  title: "title",
  start_date: "airedFrom",
  episodes: "episodes",
};

const TYPE_TO_SHIKI_KIND: Partial<Record<NonNullable<AnimeQuery["type"]>, string>> = {
  TV: "tv",
  MOVIE: "movie",
  OVA: "ova",
  ONA: "ona",
  SPECIAL: "special",
  MUSIC: "music",
};

/**
 * The catalogue: everything the app knows about anime. Served from Postgres and
 * transparently topped up from Shikimori (Russian-native metadata: titles,
 * descriptions, genres, characters). Recommendations come from Jikan, which is
 * Shikimori's weak spot. Reads check the local cache first; on a miss or stale
 * row it fetches upstream, persists, and returns; if upstream is down it serves
 * whatever is cached so the product degrades gracefully.
 */
export class CatalogService {
  private readonly prisma: PrismaClient;
  private readonly shikimori: ShikimoriClient;
  private readonly jikan: JikanClient;
  private readonly ttlMs: number;
  private readonly logger: CatalogLogger;
  private readonly translation: TranslationService;

  private readonly discoverCache = new TtlCache<DiscoverResponse>(10 * 60_000, 4);
  private readonly auxCache = new TtlCache<unknown>(60 * 60_000, 256);
  // Per (filters + page) browse results — one upstream call per unique page / 10 min.
  private readonly browseCache = new TtlCache<Paginated<AnimeSummary>>(
    10 * 60_000,
    200,
  );
  private seeded = false;

  constructor(deps: CatalogServiceDeps) {
    this.prisma = deps.prisma;
    this.shikimori = deps.shikimori;
    this.jikan = deps.jikan;
    this.ttlMs = deps.cacheTtlSeconds * 1000;
    this.logger = deps.logger;
    this.translation = deps.translation;
  }

  // -- Discover ---------------------------------------------------------

  async getDiscover(lang: Locale = DEFAULT_LOCALE): Promise<DiscoverResponse> {
    return this.discoverCache.wrap(`discover:${lang}`, async () => {
      await this.ensureSeeded();

      const [topAiring, allTimeTop, mostPopular] = await Promise.all([
        this.queryCache({ airing: "AIRING", score: { not: null } }, "score", 20),
        this.queryCache({ score: { not: null } }, "score", 20),
        // Low ids ≈ long-established classics — a distinct rail from "top rated".
        this.queryCacheAsc({}, "id", 20),
      ]);

      let thisSeason = await this.queryCache(
        { year: CURRENT_YEAR, season: CURRENT_SEASON },
        "members",
        20,
      );
      if (thisSeason.length < 6) {
        await this.fillFromShikimori("season", {
          season: `${CURRENT_SEASON}_${CURRENT_YEAR}`,
          order: "popularity",
          limit: 40,
        });
        thisSeason = await this.queryCache(
          {
            OR: [
              { year: CURRENT_YEAR, season: CURRENT_SEASON },
              { airing: "AIRING" },
            ],
          },
          "members",
          20,
        );
      }

      const spotlights = await this.pickTrendingSpotlights(
        [
          ...topAiring.slice(0, 8),
          ...thisSeason.slice(0, 8),
          ...allTimeTop.slice(0, 8),
          ...mostPopular.slice(0, 8),
        ],
        lang,
      );
      const spotlight = spotlights[0] ?? null;

      return { spotlight, spotlights, topAiring, thisSeason, allTimeTop, mostPopular };
    });
  }

  /**
   * The hero carousel's own small ranking algorithm: blend the community
   * score, how many people track it, whether it's currently airing, and — the
   * part no upstream API can give us — how much *our own* visitors have
   * actually engaged with it lately (watch sessions, list adds, comments).
   * The final order is re-shuffled with a day-keyed seed so the same handful
   * of "best" titles don't sit frozen at #1 forever; the ranking itself is
   * what decides who's even in the running.
   */
  private async pickTrendingSpotlights(
    candidates: AnimeSummary[],
    lang: Locale,
  ): Promise<AnimeDetail[]> {
    const seen = new Set<number>();
    const ids = candidates
      .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      .slice(0, 20)
      .map((a) => a.id);
    if (ids.length === 0) return [];

    const [details, engagement] = await Promise.all([
      Promise.all(ids.map((id) => this.getAnimeById(id, lang).catch(() => null))),
      this.engagementScores(ids),
    ]);

    const all = details.filter((d): d is AnimeDetail => d != null);
    // A hero with nothing to show is worse than a slightly-less-trending one —
    // require real artwork, and only fall back to the rest if too few qualify.
    const withArt = all.filter(
      (d) => d.screenshots.length > 0 || d.imageLargeUrl || d.imageUrl,
    );
    const pool = withArt.length >= 4 ? withArt : all;

    const scored = pool
      .map((anime) => ({
        anime,
        score: this.trendingScore(anime, engagement.get(anime.id) ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => s.anime);

    // Rotate the *order* of today's top picks so the carousel doesn't always
    // open on the same title — the ranking above already chose who qualifies.
    return seededShuffle(scored, `spotlight:${todayKey()}`);
  }

  private trendingScore(anime: AnimeDetail, engagement: number): number {
    const scoreNorm = (anime.score ?? 6) / 10;
    const popularityNorm = Math.log10((anime.members ?? 0) + 1) / 6;
    const engagementNorm = Math.log10(engagement + 1) / 3;
    const trailerBonus = anime.trailerEmbedUrl ? 0.1 : 0;
    const screenshotBonus = anime.screenshots.length > 0 ? 0.08 : 0;
    const airingBonus = anime.airing === "AIRING" ? 0.15 : 0;
    return (
      scoreNorm * 0.4 +
      popularityNorm * 0.2 +
      engagementNorm * 0.25 +
      trailerBonus +
      screenshotBonus +
      airingBonus
    );
  }

  /** How much our own visitors have engaged with each title in the last 2 weeks. */
  private async engagementScores(animeIds: number[]): Promise<Map<number, number>> {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const [sessions, entries, comments] = await Promise.all([
      this.prisma.watchSession.groupBy({
        by: ["animeId"],
        where: { animeId: { in: animeIds }, startedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.libraryEntry.groupBy({
        by: ["animeId"],
        where: { animeId: { in: animeIds }, updatedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.comment.groupBy({
        by: ["animeId"],
        where: { animeId: { in: animeIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const map = new Map<number, number>();
    const add = (rows: Array<{ animeId: number; _count: { _all: number } }>, weight: number) => {
      for (const r of rows) map.set(r.animeId, (map.get(r.animeId) ?? 0) + r._count._all * weight);
    };
    add(sessions, 1);
    add(entries, 2);
    add(comments, 3);
    return map;
  }

  // -- Browse / search ------------------------------------------------

  async browse(query: AnimeQuery): Promise<Paginated<AnimeSummary>> {
    if (query.q) return this.search(query, query.q);

    // Read-through paginated: the whole upstream catalogue is reachable page by
    // page, but each unique (filters + page) costs one upstream call per 10 min.
    const key = `browse:${JSON.stringify({
      p: query.page,
      pp: query.perPage,
      t: query.type ?? null,
      a: query.airing ?? null,
      g: query.genres ?? null,
      s: query.minScore ?? null,
      y: query.year ?? null,
      se: query.season ?? null,
      o: query.orderBy ?? null,
      hp: query.hasPlayer ?? null,
    })}`;
    return this.browseCache.wrap(key, () => this.browseUpstream(query));
  }

  private async browseUpstream(
    query: AnimeQuery,
  ): Promise<Paginated<AnimeSummary>> {
    try {
      const list = await this.shikimori.listAnimes({
        page: query.page,
        limit: query.perPage,
        ...this.toShikiListParams(query),
      });
      const summaries = list.map(shikiToSummary);

      // Persist for the detail cache; link genres we filtered by.
      void persistAnimeSummaries(summaries).catch((error) =>
        this.logger.warn({ error }, "failed to persist browse page"),
      );
      if (query.genres?.length && summaries.length > 0) {
        void this.prisma.genreOnAnime
          .createMany({
            data: summaries.flatMap((s) =>
              query.genres!.map((genreId) => ({ animeId: s.id, genreId })),
            ),
            skipDuplicates: true,
          })
          .catch(() => undefined);
      }

      await this.attachPlayerFlags(summaries);
      const items = query.hasPlayer
        ? summaries.filter((s) => s.hasPlayer === true)
        : summaries;
      const hasNextPage = list.length === query.perPage;

      return {
        items,
        meta: {
          page: query.page,
          perPage: query.perPage,
          total:
            (query.page - 1) * query.perPage +
            items.length +
            (hasNextPage ? query.perPage : 0),
          hasNextPage,
        },
      };
    } catch (error) {
      this.logger.warn({ error }, "browse upstream failed — serving cache");
      return this.browseFromCache(query);
    }
  }

  private async browseFromCache(
    query: AnimeQuery,
  ): Promise<Paginated<AnimeSummary>> {
    await this.ensureSeeded();
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.perPage;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.anime.findMany({
        where,
        orderBy: this.buildOrderBy(query.orderBy, query.sort),
        skip,
        take: query.perPage,
        include: ANIME_WITH_GENRES_INCLUDE,
      }),
      this.prisma.anime.count({ where }),
    ]);
    return this.page(rows, total, query);
  }

  private async search(
    query: AnimeQuery,
    q: string,
  ): Promise<Paginated<AnimeSummary>> {
    try {
      const list = await this.shikimori.listAnimes({
        search: q,
        page: query.page,
        limit: query.perPage,
        ...this.toShikiListParams(query),
      });
      const summaries = list.map(shikiToSummary);
      await persistAnimeSummaries(summaries).catch((error) =>
        this.logger.warn({ error }, "failed to persist search results"),
      );
      await this.attachPlayerFlags(summaries);

      const items = query.hasPlayer
        ? summaries.filter((s) => s.hasPlayer === true)
        : summaries;

      return {
        items,
        meta: {
          page: query.page,
          perPage: query.perPage,
          total: (query.page - 1) * query.perPage + items.length,
          hasNextPage: !query.hasPlayer && list.length === query.perPage,
        },
      };
    } catch (error) {
      this.logger.warn({ error, q }, "Shikimori search failed — falling back to cache");
      return this.searchCacheFallback(query, q);
    }
  }

  private async searchCacheFallback(
    query: AnimeQuery,
    q: string,
  ): Promise<Paginated<AnimeSummary>> {
    const where: Prisma.AnimeWhereInput = {
      ...this.buildWhere(query),
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { titleEnglish: { contains: q, mode: "insensitive" } },
        { titleJapanese: { contains: q, mode: "insensitive" } },
      ],
    };
    const skip = (query.page - 1) * query.perPage;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.anime.findMany({
        where,
        orderBy: this.buildOrderBy(query.orderBy, query.sort),
        skip,
        take: query.perPage,
        include: ANIME_WITH_GENRES_INCLUDE,
      }),
      this.prisma.anime.count({ where }),
    ]);
    if (total === 0) {
      throw new UpstreamUnavailableError("Поиск временно недоступен. Попробуйте позже.");
    }
    return this.page(rows, total, query);
  }

  // -- Detail -------------------------------------------------------

  async getAnimeById(
    id: number,
    lang: Locale = DEFAULT_LOCALE,
  ): Promise<AnimeDetail> {
    const existing = await this.prisma.anime.findUnique({
      where: { id },
      include: ANIME_WITH_GENRES_INCLUDE,
    });

    const isFresh =
      existing?.detailSyncedAt != null &&
      Date.now() - existing.detailSyncedAt.getTime() < this.ttlMs;

    if (existing && isFresh) {
      return this.translation.localizeDetail(toDetailDto(existing), lang);
    }

    try {
      const full = await this.shikimori.getAnime(id);
      const detail = shikiToDetail(full);
      let row = await persistAnimeDetail(detail);
      if (!row.imageUrl) {
        row = await this.healPoster(row);
      }
      return this.translation.localizeDetail(toDetailDto(row), lang);
    } catch (error) {
      if (existing) {
        this.logger.warn({ error, id }, "serving stale anime detail");
        return this.translation.localizeDetail(toDetailDto(existing), lang);
      }
      if (error instanceof ShikimoriError && error.status === 404) {
        throw new NotFoundError("Аниме не найдено.");
      }
      throw new UpstreamUnavailableError();
    }
  }

  /**
   * Some titles (freshly announced / airing) have no poster in the primary
   * catalogue source. MAL usually does — and its numeric id matches ours for
   * the overwhelming majority of anime — so fall back to it once and persist
   * the result, keeping the load off any single provider.
   */
  private async healPoster<
    T extends { id: number; imageUrl: string | null; title?: string },
  >(row: T): Promise<T> {
    try {
      // AniList has near-total coverage incl. brand-new / upcoming titles; try it
      // first (by MAL id, then by title), and fall back to MAL/Jikan.
      let large: string | null = null;
      let small: string | null = null;

      const external =
        (await anilistPoster(row.id, row.title)) ??
        (await kitsuPoster(row.title)) ??
        (await anilibriaPoster(row.title));
      if (external) {
        large = external;
        small = external;
      } else {
        const poster = await this.jikan.getAnimePoster(row.id);
        large = poster?.large ?? poster?.small ?? null;
        small = poster?.small ?? poster?.large ?? null;
      }

      if (!large && !small) return row;
      const updated = await this.prisma.anime.update({
        where: { id: row.id },
        data: { imageUrl: small, imageLargeUrl: large },
        include: ANIME_WITH_GENRES_INCLUDE,
      });
      return updated as unknown as T;
    } catch (error) {
      this.logger.warn({ error, id: row.id }, "poster heal failed");
      return row;
    }
  }

  async getCharacters(id: number): Promise<Character[]> {
    return this.auxCache.wrap(`characters:${id}`, async () => {
      try {
        return shikiToCharacters(await this.shikimori.getRoles(id));
      } catch (error) {
        this.logger.warn({ error, id }, "character fetch failed");
        return [];
      }
    }) as Promise<Character[]>;
  }

  async getRecommendations(id: number): Promise<RecommendationItem[]> {
    return this.auxCache.wrap(`recs:${id}`, async () => {
      try {
        const entries = await this.jikan.getAnimeRecommendations(id);
        return entries.slice(0, 12).map((entry) => ({
          id: entry.entry.mal_id,
          slug: slugify(`${entry.entry.mal_id}-${entry.entry.title}`),
          title: entry.entry.title,
          imageUrl:
            entry.entry.images?.webp?.image_url ??
            entry.entry.images?.jpg?.image_url ??
            null,
          votes: entry.votes ?? 0,
        }));
      } catch (error) {
        this.logger.warn({ error, id }, "recommendation fetch failed");
        return [];
      }
    }) as Promise<RecommendationItem[]>;
  }

  // -- Genres -----------------------------------------------------

  async listGenres(): Promise<Genre[]> {
    const cached = await this.prisma.genre.findMany({ orderBy: { name: "asc" } });
    if (cached.length > 0) {
      return cached.map((g) => ({ id: g.id, name: g.name, count: g.animeCount }));
    }
    try {
      const genres = shikiToGenres(await this.shikimori.getGenres());
      await upsertGenres(genres);
      return genres;
    } catch (error) {
      this.logger.warn({ error }, "genre fetch failed");
      return [];
    }
  }

  // -- internals ------------------------------------------------

  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    const count = await this.prisma.anime.count();
    if (count > 0) {
      this.seeded = true;
      return;
    }
    this.logger.info({}, "catalogue empty — bootstrapping from Shikimori");
    await this.fillFromShikimori("popular", { order: "popularity", limit: 50 });
    await this.fillFromShikimori("popular-2", {
      order: "popularity",
      limit: 50,
      page: 2,
    });
    await this.fillFromShikimori("ranked", { order: "ranked", limit: 50 });
    await this.fillFromShikimori("ongoing", {
      status: "ongoing",
      order: "popularity",
      limit: 40,
    });
    this.seeded = true;
  }

  private async fillFromShikimori(
    label: string,
    params: Record<string, unknown>,
    knownGenreIds: number[] = [],
  ): Promise<void> {
    try {
      // Shikimori returns just 1 result when `limit` is omitted — always set it.
      const list = await this.shikimori.listAnimes({ limit: 50, ...params });
      const summaries = list.map(shikiToSummary);
      await persistAnimeSummaries(summaries);

      // Shikimori list items carry no genres — if we queried by genre, we know
      // every result belongs to it, so link them explicitly.
      if (knownGenreIds.length > 0 && summaries.length > 0) {
        await this.prisma.genreOnAnime
          .createMany({
            data: summaries.flatMap((s) =>
              knownGenreIds.map((genreId) => ({ animeId: s.id, genreId })),
            ),
            skipDuplicates: true,
          })
          .catch(() => undefined);
      }
    } catch (error) {
      this.logger.warn({ error, label }, "Shikimori fill failed");
    }
  }

  private async attachPlayerFlags(summaries: AnimeSummary[]): Promise<void> {
    if (summaries.length === 0) return;
    const rows = await this.prisma.watchAvailability.findMany({
      where: { animeId: { in: summaries.map((s) => s.id) } },
      select: { animeId: true, hasPlayer: true },
    });
    const byId = new Map(rows.map((r) => [r.animeId, r.hasPlayer]));
    for (const summary of summaries) {
      summary.hasPlayer = byId.get(summary.id) ?? null;
    }
  }

  private page(
    rows: Array<Parameters<typeof toSummaryDto>[0]>,
    total: number,
    query: AnimeQuery,
  ): Paginated<AnimeSummary> {
    const skip = (query.page - 1) * query.perPage;
    return {
      items: rows.map(toSummaryDto),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  private async queryCache(
    where: Prisma.AnimeWhereInput,
    column: keyof Prisma.AnimeOrderByWithRelationInput,
    take: number,
  ): Promise<AnimeSummary[]> {
    const rows = await this.prisma.anime.findMany({
      where,
      orderBy: { [column]: { sort: "desc", nulls: "last" } } as Prisma.AnimeOrderByWithRelationInput,
      take,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    return rows.map(toSummaryDto);
  }

  private async queryCacheAsc(
    where: Prisma.AnimeWhereInput,
    column: keyof Prisma.AnimeOrderByWithRelationInput,
    take: number,
  ): Promise<AnimeSummary[]> {
    const rows = await this.prisma.anime.findMany({
      where,
      orderBy: { [column]: "asc" } as Prisma.AnimeOrderByWithRelationInput,
      take,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    return rows.map(toSummaryDto);
  }

  private toShikiListParams(query: AnimeQuery): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (query.type && TYPE_TO_SHIKI_KIND[query.type]) {
      params.kind = TYPE_TO_SHIKI_KIND[query.type];
    }
    if (query.airing === "AIRING") params.status = "ongoing";
    else if (query.airing === "FINISHED") params.status = "released";
    else if (query.airing === "UPCOMING") params.status = "anons";
    if (query.minScore != null) params.score = Math.floor(query.minScore);
    if (query.genres?.length) params.genre = query.genres.join(",");
    if (query.year && query.season) params.season = `${query.season}_${query.year}`;
    else if (query.year) params.season = String(query.year);
    params.order = mapOrderToShikimori(query.orderBy);
    return params;
  }

  private buildWhere(query: AnimeQuery): Prisma.AnimeWhereInput {
    const where: Prisma.AnimeWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.airing) where.airing = query.airing;
    if (query.minScore != null) where.score = { gte: query.minScore };
    if (query.year != null) where.year = query.year;
    if (query.season) where.season = query.season;
    if (query.genres && query.genres.length > 0) {
      where.genres = { some: { genreId: { in: query.genres } } };
    }
    if (query.hasPlayer) {
      where.watchAvailability = { is: { hasPlayer: true } };
    }
    return where;
  }

  private buildOrderBy(
    orderBy: AnimeOrderBy,
    sort: "asc" | "desc",
  ): Prisma.AnimeOrderByWithRelationInput {
    return {
      [ORDER_BY_COLUMN[orderBy]]: { sort, nulls: "last" },
    } as Prisma.AnimeOrderByWithRelationInput;
  }
}

function mapOrderToShikimori(orderBy: AnimeOrderBy): string {
  switch (orderBy) {
    case "score":
    case "rank":
      return "ranked";
    case "popularity":
      return "popularity";
    case "title":
      return "name";
    case "start_date":
      return "aired_on";
    case "episodes":
      return "episodes";
    default:
      return "popularity";
  }
}

const ANILIST_URL = "https://graphql.anilist.co";

/**
 * A cover image from AniList — by MAL id first, then by title. AniList covers
 * effectively the whole medium (including not-yet-aired titles) and allows
 * hot-linking, so the URL can be used directly. Returns null on any failure.
 */
async function anilistPoster(
  malId: number,
  title?: string,
): Promise<string | null> {
  const ask = async (
    query: string,
    variables: Record<string, unknown>,
  ): Promise<string | null> => {
    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data?: { Media?: { coverImage?: { extraLarge?: string; large?: string } } };
      };
      const img = json.data?.Media?.coverImage;
      const url = img?.extraLarge ?? img?.large ?? null;
      return url && !url.includes("default.jpg") ? url : null;
    } catch {
      return null;
    }
  };

  const byId = await ask(
    "query($idMal:Int){Media(idMal:$idMal,type:ANIME){coverImage{extraLarge large}}}",
    { idMal: malId },
  );
  if (byId) return byId;
  if (title && title.trim().length >= 2) {
    return ask(
      "query($search:String){Media(search:$search,type:ANIME,sort:SEARCH_MATCH){coverImage{extraLarge large}}}",
      { search: title.trim() },
    );
  }
  return null;
}

/** A poster from Kitsu by title text search. Allows hot-linking. Null on failure. */
async function kitsuPoster(title?: string): Promise<string | null> {
  if (!title || title.trim().length < 2) return null;
  try {
    const url = new URL("https://kitsu.io/api/edge/anime");
    url.searchParams.set("filter[text]", title.trim());
    url.searchParams.set("page[limit]", "1");
    url.searchParams.set("fields[anime]", "posterImage");
    const res = await fetch(url, {
      headers: { accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{ attributes?: { posterImage?: Record<string, string> } }>;
    };
    const p = json.data?.[0]?.attributes?.posterImage;
    return p?.original ?? p?.large ?? p?.medium ?? null;
  } catch {
    return null;
  }
}

/**
 * A poster from AniLibria's v3 title search — good for RU-relevant titles the
 * other sources miss. Best-effort, short timeout; the domain is occasionally
 * flaky so failures are swallowed.
 */
async function anilibriaPoster(title?: string): Promise<string | null> {
  if (!title || title.trim().length < 2) return null;
  try {
    const url = new URL("https://api.anilibria.top/api/v1/app/search/releases");
    url.searchParams.set("query", title.trim());
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{
      poster?: { src?: string; optimized?: { src?: string } };
    }>;
    const poster = Array.isArray(json) ? json[0]?.poster : undefined;
    const src = poster?.optimized?.src ?? poster?.src;
    if (!src) return null;
    return src.startsWith("http") ? src : `https://anilibria.top${src}`;
  } catch {
    return null;
  }
}
