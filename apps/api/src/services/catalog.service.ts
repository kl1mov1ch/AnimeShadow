import {
  type AniListClient,
  type AniListTrendingEntry,
} from "@animeshadow/anilist";
import type { AnimeThemesClient } from "@animeshadow/animethemes";
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
  toCharacterDetail as shikiToCharacterDetail,
  toFranchiseEntries,
  toGenreList as shikiToGenres,
} from "@animeshadow/shikimori";
import {
  type AnimeDetail,
  type AnimeOpening,
  type AnimeOrderBy,
  type AnimeQuery,
  type AnimeStats,
  type AnimeSummary,
  type Character,
  type CharacterDetail,
  DEFAULT_LOCALE,
  type DiscoverResponse,
  type FranchiseEntry,
  type Genre,
  type Locale,
  type Paginated,
  type RecommendationItem,
  slugify,
} from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { seededShuffle, todayKey } from "../lib/seeded-shuffle.js";
import { withTimeout } from "../lib/timeout.js";
import {
  AgeVerificationRequiredError,
  NotFoundError,
  UpstreamUnavailableError,
} from "../lib/errors.js";
import {
  filterAdultSummaries,
  isAdultRating,
  isHentaiRating,
  withContentGuard,
} from "../lib/content-guard.js";
import type { TranslationService } from "./translation.service.js";
import type { Translator } from "./translator.js";

/** What the artwork heal needs to know about a row before deciding to run. */
interface ArtworkHealRow {
  id: number;
  title: string;
  bannerImage: string | null;
  accentColor: string | null;
}

interface CatalogLogger {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

export interface CatalogServiceDeps {
  prisma: PrismaClient;
  shikimori: ShikimoriClient;
  jikan: JikanClient;
  anilist: AniListClient;
  animethemes: AnimeThemesClient;
  cacheTtlSeconds: number;
  logger: CatalogLogger;
  translation: TranslationService;
  translator: Translator;
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
  private readonly anilist: AniListClient;
  private readonly animethemes: AnimeThemesClient;
  private readonly ttlMs: number;
  private readonly logger: CatalogLogger;
  private readonly translation: TranslationService;
  private readonly translator: Translator;

  private readonly discoverCache = new TtlCache<DiscoverResponse>(10 * 60_000, 4);
  private readonly auxCache = new TtlCache<unknown>(60 * 60_000, 256);
  // Per (filters + page) browse results — one upstream call per unique page / 10 min.
  private readonly browseCache = new TtlCache<Paginated<AnimeSummary>>(
    10 * 60_000,
    200,
  );
  private seeded = false;
  // Ids currently being healed across providers — dedupes concurrent requests
  // for the same poster-less row instead of piling on the same external calls.
  private readonly healingIds = new Set<number>();

  constructor(deps: CatalogServiceDeps) {
    this.prisma = deps.prisma;
    this.shikimori = deps.shikimori;
    this.jikan = deps.jikan;
    this.anilist = deps.anilist;
    this.animethemes = deps.animethemes;
    this.ttlMs = deps.cacheTtlSeconds * 1000;
    this.logger = deps.logger;
    this.translation = deps.translation;
    this.translator = deps.translator;
  }

  // -- Discover ---------------------------------------------------------

  async getDiscover(
    lang: Locale = DEFAULT_LOCALE,
    allowAdult = false,
  ): Promise<DiscoverResponse> {
    return this.discoverCache.wrap(`discover:${lang}:${allowAdult}`, async () => {
      await this.ensureSeeded();

      const [
        topAiring,
        allTimeTop,
        mostPopular,
        trendingNow,
        trendingMonth,
        upcoming,
      ] = await Promise.all([
        this.queryCache({ airing: "AIRING", score: { not: null } }, "score", 20, allowAdult),
        this.queryCache({ score: { not: null } }, "score", 20, allowAdult),
        // Low ids ≈ long-established classics — a distinct rail from "top rated".
        this.queryCacheAsc({}, "id", 20, allowAdult),
        this.trendingNowBlended(20, allowAdult),
        this.mostWatchedRecently(30, 20, allowAdult),
        this.queryCacheAsc(
          { airing: "UPCOMING", airedFrom: { gte: new Date() } },
          "airedFrom",
          20,
          allowAdult,
        ),
      ]);

      let thisSeason = await this.queryCache(
        { year: CURRENT_YEAR, season: CURRENT_SEASON },
        "members",
        20,
        allowAdult,
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
          allowAdult,
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

      return {
        spotlight,
        spotlights,
        topAiring,
        thisSeason,
        allTimeTop,
        mostPopular,
        trendingNow,
        trendingMonth,
        upcoming,
      };
    });
  }

  /**
   * A genuine "what's being watched" ranking — our own visitors' WatchSession
   * starts within the window, grouped and counted. No upstream API can give
   * us this; it's the one home-page signal that's entirely our own data.
   */
  private async mostWatchedRecently(
    days: number,
    limit: number,
    allowAdult: boolean,
  ): Promise<AnimeSummary[]> {
    const since = new Date(Date.now() - days * 86_400_000);
    const grouped = await this.prisma.watchSession.groupBy({
      by: ["animeId"],
      where: { startedAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { animeId: "desc" } },
      take: limit,
    });
    const ids = grouped.map((g) => g.animeId);
    if (ids.length === 0) return [];

    const rows = await this.prisma.anime.findMany({
      where: withContentGuard({ id: { in: ids } }, allowAdult),
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is (typeof rows)[number] => r != null)
      .map(toSummaryDto);
    this.scheduleHealMissingDetail(items);
    return items;
  }

  /**
   * "Watching right now" — our own real WatchSession activity first (that's
   * genuinely what's playing on this site), padded out with titles AniList's
   * whole community is currently trending (a real cross-site aggregate, not
   * a guess) whenever our own traffic alone is too thin to fill the row. Only
   * pads with titles already in our catalogue — never fetches a brand-new
   * title just to fill a slot. Every item is guaranteed a poster before it's
   * returned; nothing reaches the client blank.
   */
  private async trendingNowBlended(
    limit: number,
    allowAdult: boolean,
  ): Promise<AnimeSummary[]> {
    const own = await this.mostWatchedRecently(2, limit, allowAdult);
    if (own.length >= limit) return this.ensureImages(own);

    const seen = new Set(own.map((a) => a.id));
    const external = await this.externalTrendingMap();
    const padIds = [...external.keys()].filter((id) => !seen.has(id));

    let pad: AnimeSummary[] = [];
    if (padIds.length > 0) {
      const rows = await this.prisma.anime.findMany({
        where: withContentGuard({ id: { in: padIds } }, allowAdult),
        include: ANIME_WITH_GENRES_INCLUDE,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      // Preserve AniList's own trending order, not the DB's arbitrary order.
      pad = padIds
        .map((id) => byId.get(id))
        .filter((r): r is (typeof rows)[number] => r != null)
        .map(toSummaryDto);
    }

    const combined = [...own, ...pad].slice(0, limit);
    this.scheduleHealMissingDetail(combined);
    return this.ensureImages(combined, external);
  }

  /**
   * AniList's own trending ranking — computed by an entirely separate site
   * from its entire community, so it's a genuine second "popularity" signal
   * beyond our own traffic. One request, cached for the whole hour; every
   * entry already carries a poster/banner, which `ensureImages` reuses for
   * free instead of making a second round of lookups.
   */
  private async externalTrendingMap(): Promise<Map<number, AniListTrendingEntry>> {
    const entries = (await this.auxCache.wrap("anilist-trending", () =>
      this.anilist.getTrending(),
    )) as AniListTrendingEntry[];
    return new Map(entries.map((e) => [e.idMal, e]));
  }

  /**
   * Guarantees every summary in the list has a poster before it reaches the
   * client. Cheap when `external` already carries a cover for the id (no
   * extra request); otherwise falls back to the same cross-provider cascade
   * poster-healing uses elsewhere. Only touches items missing an image.
   */
  private async ensureImages(
    items: AnimeSummary[],
    external?: Map<number, AniListTrendingEntry>,
  ): Promise<AnimeSummary[]> {
    return Promise.all(
      items.map(async (item) => {
        if (item.imageUrl || item.imageLargeUrl) return item;
        try {
          const cover = external?.get(item.id)?.artwork.cover ?? null;
          const externalPoster =
            cover ??
            (await this.anilist.getByMalId(item.id, item.title))?.artwork.cover ??
            (await kitsuPoster(item.title)) ??
            (await anilibriaPoster(item.title));

          let large = externalPoster;
          let small = externalPoster;
          if (!externalPoster) {
            const poster = await this.jikan.getAnimePoster(item.id);
            large = poster?.large ?? poster?.small ?? null;
            small = poster?.small ?? poster?.large ?? null;
          }
          if (!large && !small) return item;

          await this.prisma.anime
            .update({ where: { id: item.id }, data: { imageUrl: small, imageLargeUrl: large } })
            .catch(() => undefined);
          return { ...item, imageUrl: small, imageLargeUrl: large };
        } catch (error) {
          this.logger.warn({ error, id: item.id }, "trending image heal failed");
          return item;
        }
      }),
    );
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

    // Fetch each finalist's real key-visual banner (cached in the DB after
    // the first lookup — see resolveSpotlightBanner) before rotating order.
    const withBanners = await Promise.all(
      scored.map((anime) => this.resolveSpotlightBanner(anime)),
    );

    // Rotate the *order* of today's top picks so the carousel doesn't always
    // open on the same title — the ranking above already chose who qualifies.
    return seededShuffle(withBanners, `spotlight:${todayKey()}`);
  }

  /**
   * A wide banner is fetched once per title and cached on the row — most
   * calls here are a no-op DB-hit-free return. Only the handful of titles
   * that actually make the spotlight shortlist ever pay the AniList lookup.
   */
  private async resolveSpotlightBanner(anime: AnimeDetail): Promise<AnimeDetail> {
    if (anime.bannerImage) return anime;
    try {
      const banner =
        (await this.anilist.getByMalId(anime.id, anime.title))?.artwork.banner ??
        (await kitsuBanner(anime.title));
      if (!banner) return anime;
      await this.prisma.anime
        .update({ where: { id: anime.id }, data: { bannerImage: banner } })
        .catch(() => undefined);
      return { ...anime, bannerImage: banner };
    } catch (error) {
      this.logger.warn({ error, id: anime.id }, "spotlight banner heal failed");
      return anime;
    }
  }

  /**
   * Weighted mostly toward what our own visitors are actually watching this
   * week — a static top-score title with no recent activity should not beat
   * a title people are currently binging, or the carousel never changes.
   * Score/popularity still matter (they gate quality and break ties when
   * everything's fresh, e.g. a brand-new dev DB with no watch history yet).
   */
  private trendingScore(anime: AnimeDetail, engagement: number): number {
    const scoreNorm = (anime.score ?? 6) / 10;
    const popularityNorm = Math.log10((anime.members ?? 0) + 1) / 6;
    const engagementNorm = Math.log10(engagement + 1) / 3;
    const trailerBonus = anime.trailerEmbedUrl ? 0.08 : 0;
    const screenshotBonus = anime.screenshots.length > 0 || anime.bannerImage ? 0.05 : 0;
    const airingBonus = anime.airing === "AIRING" ? 0.1 : 0;
    return (
      scoreNorm * 0.2 +
      popularityNorm * 0.12 +
      engagementNorm * 0.5 +
      trailerBonus +
      screenshotBonus +
      airingBonus
    );
  }

  /** How much our own visitors have actually watched/tracked each title this week. */
  private async engagementScores(animeIds: number[]): Promise<Map<number, number>> {
    const since = new Date(Date.now() - 7 * 86_400_000);
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

  async browse(query: AnimeQuery, allowAdult = false): Promise<Paginated<AnimeSummary>> {
    if (query.q) return this.search(query, query.q, allowAdult);
    // Filters Shikimori's list endpoint has no concept of: studio, and our
    // own player availability. Upstream would silently ignore them and hand
    // back the unfiltered catalogue, so these run against the local cache
    // instead — which only covers titles already synced (for a studio
    // someone just clicked from an anime page, or a title we've actually
    // resolved a player for, that's exactly the set worth surfacing anyway).
    //
    // It also fixes the page-size wobble: filtering upstream results *after*
    // fetching them meant a page that asked for 20 could render 14. The
    // cache applies all of it in SQL with a real LIMIT, so every page is
    // exactly perPage until the last one.
    if (query.studio || query.hasPlayer || query.hasCustomPlayer) {
      return this.browseFromCache(query, allowAdult);
    }

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
      adult: allowAdult,
    })}`;
    return this.browseCache.wrap(key, () => this.browseUpstream(query, allowAdult));
  }

  private async browseUpstream(
    query: AnimeQuery,
    allowAdult: boolean,
  ): Promise<Paginated<AnimeSummary>> {
    try {
      const list = await this.shikimori.listAnimes({
        page: query.page,
        limit: query.perPage,
        ...this.toShikiListParams(query),
      });
      const summaries = list.map(shikiToSummary);

      // Persist for the detail cache; link genres we filtered by. Awaited
      // (not fire-and-forget) because the response below reads it straight
      // back — Shikimori's list shape carries no genres/synopsis/rating, so
      // serving it as-is would blank out richer data a detail-page visit
      // already found for the exact same titles.
      await persistAnimeSummaries(summaries).catch((error) =>
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

      const enriched = await this.enrichFromDb(summaries);
      await this.attachPlayerFlags(enriched);
      // Shikimori's own censored flag (see the shikimori package) keeps hentai
      // out at the source; this backstops R+ — a tier that flag doesn't
      // necessarily cover — using the rating enrichFromDb just filled in.
      const filtered = filterAdultSummaries(enriched, allowAdult);
      const items = query.hasPlayer
        ? filtered.filter((s) => s.hasPlayer === true)
        : filtered;
      this.scheduleHealMissingDetail(items);
      const hasNextPage = list.length === query.perPage;

      // A rolling "one page ahead" guess made the pager claim the catalogue
      // ended after a couple of pages. The local cache knows how many titles
      // actually match, so use that as the floor for the real total.
      const cachedTotal = await this.prisma.anime
        .count({ where: this.buildWhere(query, allowAdult) })
        .catch(() => 0);
      const seenSoFar =
        (query.page - 1) * query.perPage +
        items.length +
        (hasNextPage ? query.perPage : 0);

      return {
        items,
        meta: {
          page: query.page,
          perPage: query.perPage,
          total: Math.max(cachedTotal, seenSoFar),
          hasNextPage,
        },
      };
    } catch (error) {
      this.logger.warn({ error }, "browse upstream failed — serving cache");
      return this.browseFromCache(query, allowAdult);
    }
  }

  private async browseFromCache(
    query: AnimeQuery,
    allowAdult: boolean,
  ): Promise<Paginated<AnimeSummary>> {
    await this.ensureSeeded();
    const where = this.buildWhere(query, allowAdult);
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
    allowAdult: boolean,
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
      const enriched = await this.enrichFromDb(summaries);
      await this.attachPlayerFlags(enriched);

      // Search can't route these to the cache the way browse() does — a
      // relevance-ranked query has no SQL equivalent here — so they stay a
      // post-fetch filter, which is also why hasNextPage stops trusting the
      // upstream count whenever either one is on.
      const filtered = filterAdultSummaries(enriched, allowAdult);
      const items = filtered.filter(
        (s) =>
          (!query.hasPlayer || s.hasPlayer === true) &&
          (!query.hasCustomPlayer || s.hasCustomPlayer),
      );
      this.scheduleHealMissingDetail(items);
      const playerFiltered = Boolean(query.hasPlayer || query.hasCustomPlayer);

      return {
        items,
        meta: {
          page: query.page,
          perPage: query.perPage,
          total: (query.page - 1) * query.perPage + items.length,
          hasNextPage: !playerFiltered && list.length === query.perPage,
        },
      };
    } catch (error) {
      this.logger.warn({ error, q }, "Shikimori search failed — falling back to cache");
      return this.searchCacheFallback(query, q, allowAdult);
    }
  }

  private async searchCacheFallback(
    query: AnimeQuery,
    q: string,
    allowAdult: boolean,
  ): Promise<Paginated<AnimeSummary>> {
    const where: Prisma.AnimeWhereInput = {
      ...this.buildWhere(query, allowAdult),
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
    allowAdult = false,
  ): Promise<AnimeDetail> {
    const existing = await this.prisma.anime.findUnique({
      where: { id },
      include: ANIME_WITH_GENRES_INCLUDE,
    });

    const isFresh =
      existing?.detailSyncedAt != null &&
      Date.now() - existing.detailSyncedAt.getTime() < this.ttlMs;

    if (existing && isFresh) {
      this.assertViewable(existing.rating, allowAdult);
      this.scheduleHealBanner(existing);
      const detail = toDetailDto(existing);
      await this.enrichFromAniList(detail);
      detail.studioLogos = await this.getStudioLogos(detail.studios);
      return this.translation.localizeDetail(detail, lang);
    }

    try {
      const full = await this.shikimori.getAnime(id);
      const detail = shikiToDetail(full);
      this.assertViewable(detail.rating, allowAdult);
      let row = await persistAnimeDetail(detail);
      if (!row.imageUrl) {
        row = await this.healPoster(row);
      }
      this.scheduleHealBanner(row);
      const dto = toDetailDto(row);
      await this.enrichFromAniList(dto);
      dto.studioLogos = await this.getStudioLogos(dto.studios);
      return this.translation.localizeDetail(dto, lang);
    } catch (error) {
      // Deliberate content-gate rejections, not an upstream problem — must
      // never fall through to "serve whatever's cached" below.
      if (error instanceof AgeVerificationRequiredError || error instanceof NotFoundError) {
        throw error;
      }
      if (existing) {
        this.assertViewable(existing.rating, allowAdult);
        this.logger.warn({ error, id }, "serving stale anime detail");
        const stale = toDetailDto(existing);
        stale.studioLogos = await this.getStudioLogos(stale.studios);
        return this.translation.localizeDetail(stale, lang);
      }
      if (error instanceof ShikimoriError && error.status === 404) {
        throw new NotFoundError("Аниме не найдено.");
      }
      throw new UpstreamUnavailableError();
    }
  }

  /** Hentai is blocked outright (404 — as if the title doesn't exist); real
   * 18+ content is blocked until the viewer has confirmed their age. */
  private assertViewable(rating: string | null, allowAdult: boolean): void {
    if (isHentaiRating(rating)) throw new NotFoundError("Аниме не найдено.");
    if (!allowAdult && isAdultRating(rating)) throw new AgeVerificationRequiredError();
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
        (await this.anilist.getByMalId(row.id, row.title))?.artwork.cover ??
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

  /**
   * The three things AniList knows that our own catalogue does not: when the
   * next episode airs, what the community tagged the title as, and where it
   * can legally be watched. One request for all three — they used to cost a
   * round trip each — cached an hour at a time, which is finer precision than
   * any of them actually change at and keeps a popular title from re-querying
   * AniList on every single page view.
   */
  /**
   * A title's opening, for use as motion on the page. Cached because the
   * answer never changes and because both the hero and any hovered card ask
   * for it — a null (the archive simply has no opening for this title) is
   * cached just as firmly as a hit, so a title without one stops costing a
   * request per hover.
   */
  async getOpening(malId: number): Promise<AnimeOpening | null> {
    return this.auxCache.wrap(`opening:${malId}`, () =>
      this.animethemes.getOpening(malId),
    ) as Promise<AnimeOpening | null>;
  }

  /**
   * One cached AniList record per title. Both the artwork heal and the detail
   * enrichment want the same Media node, and a title whose colour AniList
   * simply does not have would otherwise re-ask on every single page view.
   */
  private anilistMedia(
    malId: number,
    title: string,
  ): Promise<Awaited<ReturnType<AniListClient["getByMalId"]>>> {
    return this.auxCache.wrap(`anilist-media:${malId}`, () =>
      this.anilist.getByMalId(malId, title),
    ) as Promise<Awaited<ReturnType<AniListClient["getByMalId"]>>>;
  }

  private async enrichFromAniList(detail: AnimeDetail): Promise<void> {
    const media = await this.anilistMedia(detail.id, detail.title);
    if (!media) return;

    // Only meaningful while a title is still going out; a finished show
    // reports whatever its last entry was, which would read as a promise of
    // a new episode that is never coming.
    if (detail.airing === "AIRING" && media.nextEpisode) {
      detail.nextEpisode = media.nextEpisode;
    }
    if (media.tags.length > 0) detail.tags = media.tags;
    if (media.streamingLinks.length > 0) detail.streamingLinks = media.streamingLinks;
  }

  /**
   * Best-effort studio logos (MAL/Jikan producer art) for a bit of visual
   * variety on the detail page — cached per studio name (an hour at a time,
   * same as `auxCache`'s other entries) since many titles share a studio.
   * A studio Jikan doesn't know, or whose top hit doesn't actually match the
   * name we asked for, is simply left out of the map rather than guessing.
   */
  private async getStudioLogos(studios: string[]): Promise<Record<string, string>> {
    // Hard cap on the whole lookup, not just each Jikan call — JikanClient
    // serialises every request through one rate-limited queue, so when Jikan
    // itself is slow/erroring, several studios' worth of retries queue up
    // one after another and can add tens of seconds. That must never block
    // the detail page; a missing logo is cosmetic, a stuck page isn't. The
    // slow lookup keeps running and still populates the cache for next time.
    const entries = await withTimeout(
      Promise.all(
        studios.map(async (name) => {
          const logo = (await this.auxCache.wrap(`studio-logo:${name.toLowerCase()}`, () =>
            this.lookupStudioLogo(name),
          )) as string | null;
          return [name, logo] as const;
        }),
      ),
      2500,
      studios.map((name) => [name, null] as const),
    );
    const out: Record<string, string> = {};
    for (const [name, logo] of entries) {
      if (logo) out[name] = logo;
    }
    return out;
  }

  private async lookupStudioLogo(name: string): Promise<string | null> {
    try {
      const results = await this.jikan.searchProducers(name, 3);
      const match = results.find((producer) =>
        (producer.titles ?? []).some((t) => namesMatch(t.title, name)),
      );
      const set = match?.images?.jpg ?? match?.images?.webp;
      return set?.image_url ?? set?.large_image_url ?? null;
    } catch (error) {
      this.logger.warn({ error, name }, "studio logo lookup failed");
      return null;
    }
  }

  /**
   * The detail page's own cinematic header wants the same wide banner the
   * spotlight uses — and while we're asking AniList anyway, its cover art is
   * simply higher-resolution than what most titles have synced from
   * Shikimori, so the poster gets upgraded in the same pass. This is a
   * quality upgrade, not a "fix missing data" heal, so it overwrites an
   * existing poster on purpose. Fire-and-forget (never blocks a page load on
   * an external lookup), and it runs once per title rather than on every
   * later visit — but only once it has everything it came for. Gating on the
   * banner alone would have permanently skipped the accent colour for every
   * title that already had a banner stored from before that column existed.
   */
  private scheduleHealBanner(row: ArtworkHealRow): void {
    if (row.bannerImage && row.accentColor) return;
    void this.healArtwork(row);
  }

  /**
   * Fills in artwork for titles nobody has opened yet, most-popular first.
   *
   * Without this the accent colour only ever arrived one detail-page visit at
   * a time, so "the page wears the title's colour" was true of a few dozen
   * rows out of thousands — which reads as the feature not working rather
   * than as it not having got there yet. Paced by the AniList client's own
   * queue; the batch size is what bounds a single pass.
   */
  async warmArtwork(limit: number): Promise<void> {
    if (limit <= 0) return;
    const targets = await this.prisma.anime.findMany({
      where: { accentColor: null },
      orderBy: [{ members: { sort: "desc", nulls: "last" } }],
      take: limit,
      select: { id: true, title: true, bannerImage: true, accentColor: true },
    });
    if (targets.length === 0) return;

    this.logger.info({ count: targets.length }, "warming artwork");
    for (const row of targets) {
      await this.healArtwork(row);
    }
    this.logger.info({ count: targets.length }, "artwork warm done");
  }

  /** The awaitable half of the heal, so a warm pass can pace itself against
   *  it instead of firing every title at once. */
  private async healArtwork(row: ArtworkHealRow): Promise<void> {
    try {
      const media = await this.anilistMedia(row.id, row.title);
      const artwork = media?.artwork;
      // Keep a banner we already have: re-resolving it would cost a Kitsu
      // round trip to arrive at the same URL. This pass may now run a second
      // time for a title that has a banner but no colour yet.
      const banner = row.bannerImage
        ? null
        : artwork?.banner ?? (await kitsuBanner(row.title));
      const data: {
        bannerImage?: string;
        imageUrl?: string;
        imageLargeUrl?: string;
        accentColor?: string;
      } = {};
      if (banner) data.bannerImage = banner;
      if (artwork?.cover) {
        data.imageUrl = artwork.cover;
        data.imageLargeUrl = artwork.cover;
      }
      // Comes free with the artwork request — AniList reports the cover's own
      // dominant colour, so the page can be tinted without the browser having
      // to load and sample the poster first.
      if (artwork?.color) data.accentColor = artwork.color;
      if (Object.keys(data).length === 0) return;
      await this.prisma.anime.update({ where: { id: row.id }, data });
    } catch (error) {
      this.logger.warn({ error, id: row.id }, "artwork heal failed");
    }
  }

  /**
   * Any listing (browse/search/discover/recommendations) can surface a row
   * that was only ever seeded from Shikimori's list/search shape — no
   * poster, and (the shape carries no synopsis at all) no description
   * either. Rather than block that response on fixing it, heal it in the
   * background — the DB gets fixed for next time, and a still-open request
   * for the same id is skipped instead of duplicated.
   *
   * A missing synopsis needs a full detail fetch (only Shikimori's full
   * resource has one — no image aggregator substitutes for it), which also
   * picks up genres/rating/scoredBy/trailer and heals the poster along the
   * way. A missing poster with a synopsis already present just needs the
   * cheaper cross-provider image cascade.
   */
  private scheduleHealMissingDetail(
    items: ReadonlyArray<{
      id: number;
      imageUrl: string | null;
      synopsis?: string | null;
      title?: string;
    }>,
  ): void {
    for (const item of items) {
      if (this.healingIds.has(item.id)) continue;
      const missingSynopsis = !item.synopsis;
      const missingImage = !item.imageUrl;
      if (!missingImage && !missingSynopsis) continue;

      this.healingIds.add(item.id);
      const job = missingSynopsis
        ? this.getAnimeById(item.id, DEFAULT_LOCALE)
        : this.healPoster(item);
      void job.catch(() => undefined).finally(() => this.healingIds.delete(item.id));
    }
  }

  /**
   * Our own "most viewed" signal, admin-only for now (no endpoint reads it
   * yet — this just starts collecting it). Called from the detail-page
   * routes only, never from internal reuse of getAnimeById (e.g. spotlight
   * ranking), so it reflects real visits and not incidental lookups.
   */
  recordView(id: number): void {
    void this.prisma.anime
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);
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

  /**
   * Full bio for the character modal — Shikimori's structured description,
   * plus extra gallery art from Jikan when MAL happens to be reachable.
   * Shikimori character ids are MAL ids, so the same id is safe to ask for.
   */
  async getCharacterDetail(id: number, lang: Locale = DEFAULT_LOCALE): Promise<CharacterDetail | null> {
    const base = await this.auxCache.wrap(`character:v3:${id}`, async () => {
      try {
        const [detail, pictures] = await Promise.all([
          this.shikimori.getCharacter(id).then(shikiToCharacterDetail),
          withTimeout(this.jikan.getCharacterPictures(id), 4_000, [] as string[]),
        ]);
        return { ...detail, images: [...new Set([...detail.images, ...pictures])].slice(0, 12) };
      } catch (error) {
        this.logger.warn({ error, id }, "character detail fetch failed");
        return null;
      }
    }) as CharacterDetail | null;

    if (!base || lang === "ru") return base;
    if (!base.description && base.facts.length === 0 && base.sections.length === 0) return base;

    return this.auxCache.wrap(`character:v3:${id}:en`, async () => {
      const tr = (text: string) => this.translator.translate(text, "ru", "en").catch(() => null);
      const [translatedBio, translatedFacts, sections] = await Promise.all([
        base.description ? tr(base.description) : Promise.resolve(null),
        Promise.all(base.facts.map((fact) => tr(fact))),
        Promise.all(
          base.sections.map(async (section) => ({
            title: (await tr(section.title)) ?? section.title,
            body: (await tr(section.body)) ?? section.body,
          })),
        ),
      ]);
      const facts = base.facts.map((fact, i) => translatedFacts[i] ?? fact);
      const bioOk = !base.description || translatedBio != null;
      return {
        ...base,
        description: translatedBio ?? base.description,
        facts,
        sections,
        translated: bioOk,
      };
    }) as Promise<CharacterDetail>;
  }

  /**
   * Every season/movie/spin-off sharing this title's continuity that's
   * actually worth linking to — Shikimori's graph includes plenty of titles
   * we have no player for (or no artwork), and a dead link is worse than no
   * link. Filtered down to what `WatchAvailability` already confirmed has a
   * working player, plus a poster; the title being viewed is always kept
   * regardless (it's not a "link" for the viewer, just a marker of where
   * they are). Standalone titles (no franchise graph, or Shikimori 404s)
   * just get an empty list — the section hides itself in that case.
   */
  async getFranchise(id: number): Promise<FranchiseEntry[]> {
    return this.auxCache.wrap(`franchise:v2:${id}`, async () => {
      try {
        const raw = await this.shikimori.getFranchise(id);
        const entries = toFranchiseEntries(raw, id);
        if (entries.length === 0) return entries;

        const availability = await this.prisma.watchAvailability.findMany({
          where: { animeId: { in: entries.map((e) => e.id) }, hasPlayer: true },
          select: { animeId: true },
        });
        const playable = new Set(availability.map((a) => a.animeId));

        return entries.filter(
          (e) => e.current || (playable.has(e.id) && e.imageUrl != null),
        );
      } catch (error) {
        this.logger.warn({ error, id }, "franchise fetch failed");
        return [];
      }
    }) as Promise<FranchiseEntry[]>;
  }

  /**
   * Audience counts from MAL, cached alongside the other per-title extras.
   * Returns null rather than throwing when Jikan is unreachable — this is
   * a garnish under the synopsis, and a detail page must never fail over
   * one that didn't load.
   */
  async getAnimeStats(id: number): Promise<AnimeStats | null> {
    return this.auxCache.wrap(`stats:${id}`, async () => {
      try {
        const raw = await this.jikan.getAnimeStatistics(id);
        return {
          watching: raw.watching ?? null,
          completed: raw.completed ?? null,
          onHold: raw.on_hold ?? null,
          dropped: raw.dropped ?? null,
          planToWatch: raw.plan_to_watch ?? null,
          total: raw.total ?? null,
        };
      } catch (error) {
        this.logger.warn({ error, id }, "anime statistics fetch failed");
        return null;
      }
    }) as Promise<AnimeStats | null>;
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

  /**
   * Shikimori's list/search shape carries no genres, synopsis, rating,
   * scoredBy or trailer — only a full detail fetch does. Rather than serve
   * that thin shape as-is (which is what made list-view catalogue cards look
   * empty even for titles someone had already opened the detail page for),
   * swap each summary for whatever richer row is already stored — persisted
   * detail visits and prior heals both land there. Falls back to the plain
   * summary for a title that's genuinely never been synced before. Order is
   * preserved (it's Shikimori's own ranking for this page).
   */
  private async enrichFromDb(summaries: AnimeSummary[]): Promise<AnimeSummary[]> {
    if (summaries.length === 0) return summaries;
    const rows = await this.prisma.anime.findMany({
      where: { id: { in: summaries.map((s) => s.id) } },
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return summaries.map((s) => {
      const row = byId.get(s.id);
      return row ? toSummaryDto(row) : s;
    });
  }

  private async attachPlayerFlags(summaries: AnimeSummary[]): Promise<void> {
    if (summaries.length === 0) return;
    const rows = await this.prisma.watchAvailability.findMany({
      where: { animeId: { in: summaries.map((s) => s.id) } },
      select: { animeId: true, hasPlayer: true, hasCustomPlayer: true },
    });
    const byId = new Map(rows.map((r) => [r.animeId, r]));
    for (const summary of summaries) {
      const row = byId.get(summary.id);
      summary.hasPlayer = row?.hasPlayer ?? null;
      summary.hasCustomPlayer = row?.hasCustomPlayer ?? false;
    }
  }

  private page(
    rows: Array<Parameters<typeof toSummaryDto>[0]>,
    total: number,
    query: AnimeQuery,
  ): Paginated<AnimeSummary> {
    const skip = (query.page - 1) * query.perPage;
    const items = rows.map(toSummaryDto);
    this.scheduleHealMissingDetail(items);
    return {
      items,
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
    allowAdult: boolean,
  ): Promise<AnimeSummary[]> {
    const rows = await this.prisma.anime.findMany({
      where: withContentGuard(where, allowAdult),
      orderBy: { [column]: { sort: "desc", nulls: "last" } } as Prisma.AnimeOrderByWithRelationInput,
      take,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const items = rows.map(toSummaryDto);
    this.scheduleHealMissingDetail(items);
    return items;
  }

  private async queryCacheAsc(
    where: Prisma.AnimeWhereInput,
    column: keyof Prisma.AnimeOrderByWithRelationInput,
    take: number,
    allowAdult: boolean,
  ): Promise<AnimeSummary[]> {
    const rows = await this.prisma.anime.findMany({
      where: withContentGuard(where, allowAdult),
      orderBy: { [column]: "asc" } as Prisma.AnimeOrderByWithRelationInput,
      take,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const items = rows.map(toSummaryDto);
    this.scheduleHealMissingDetail(items);
    return items;
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

  private buildWhere(query: AnimeQuery, allowAdult: boolean): Prisma.AnimeWhereInput {
    const where: Prisma.AnimeWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.airing) where.airing = query.airing;
    if (query.minScore != null) where.score = { gte: query.minScore };
    if (query.year != null) where.year = query.year;
    if (query.season) where.season = query.season;
    if (query.genres && query.genres.length > 0) {
      where.genres = { some: { genreId: { in: query.genres } } };
    }
    if (query.studio) {
      where.studios = { has: query.studio };
    }
    // Both conditions can be requested together (a stricter "and it's our
    // own player" on top of "has a player at all") — merge into the same
    // `is` filter rather than letting the second assignment clobber the
    // first outright.
    if (query.hasPlayer || query.hasCustomPlayer) {
      where.watchAvailability = {
        is: {
          ...(query.hasPlayer ? { hasPlayer: true } : {}),
          ...(query.hasCustomPlayer ? { hasCustomPlayer: true } : {}),
        },
      };
    }
    return withContentGuard(where, allowAdult);
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

/** Loose match for "is this Jikan producer title actually the studio we asked about" —
 * punctuation/case-insensitive so "Studio Bind" ≈ "STUDIO BIND", "MAPPA" ≈ "Mappa Co., Ltd.". */
function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
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

// AniList lookups all live in @animeshadow/anilist now. They used to be five
// near-identical functions here, each with its own fetch, timeout and error
// swallowing, and — between them — no notion of AniList's rate limit at all,
// so a background heal pass could burst straight into a minute of 429s and
// take the live requests down with it.

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
 * A wide banner from Kitsu (`coverImage`, up to 3360×800) by title text
 * search — a real second source for spotlight backdrops, distinct from the
 * tall `posterImage` used for poster healing. Null on failure or when the
 * title has no cover uploaded.
 */
async function kitsuBanner(title?: string): Promise<string | null> {
  if (!title || title.trim().length < 2) return null;
  try {
    const url = new URL("https://kitsu.io/api/edge/anime");
    url.searchParams.set("filter[text]", title.trim());
    url.searchParams.set("page[limit]", "1");
    url.searchParams.set("fields[anime]", "coverImage");
    const res = await fetch(url, {
      headers: { accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{ attributes?: { coverImage?: Record<string, string> } }>;
    };
    const c = json.data?.[0]?.attributes?.coverImage;
    return c?.large ?? c?.original ?? c?.small ?? null;
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
