import {
  ANIME_WITH_GENRES_INCLUDE,
  type PrismaClient,
  persistAnimeSummaries,
  toSummaryDto,
} from "@animeshadow/db";
import {
  type ShikimoriClient,
  toAnimeSummary as shikiToSummary,
} from "@animeshadow/shikimori";
import type {
  AnimeSummary,
  Locale,
  SearchGroup,
  SearchReason,
  SmartSearchResponse,
} from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { FuzzyTitleIndex, queryVariants, titleKey } from "../lib/fuzzy-title.js";
import { withTimeout } from "../lib/timeout.js";
import { detectMood } from "./mood-keywords.js";
import { isAdultRating, isHentaiRating } from "../lib/content-guard.js";

interface SearchLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface SearchServiceDeps {
  prisma: PrismaClient;
  shikimori: ShikimoriClient;
  logger: SearchLogger;
}

interface Candidate {
  summary: AnimeSummary;
  reason: SearchReason;
  label: string | null;
  rank: number;
}

interface TitleMatch {
  summary: AnimeSummary;
  /** From FuzzyTitleIndex: 1000 exact … 600 contained, under 500 a typo. */
  score: number;
}

/** How long the in-memory title index is trusted before it is rebuilt. */
const INDEX_TTL_MS = 10 * 60_000;

/**
 * A local match this good means the person typed the name correctly; below
 * it, the local catalogue only guessed at a typo and upstream deserves a look.
 */
const STRONG_MATCH = 600;

const REASON_PRIORITY: Record<SearchReason, number> = {
  title: 0,
  character: 1,
  studio: 2,
  mood: 3,
  synopsis: 4,
};

/**
 * Smart search: one query, four lenses — title, character name, mood/vibe
 * (genre keywords), and synopsis text — merged, de-duplicated and ranked.
 */
export class SearchService {
  private readonly prisma: PrismaClient;
  private readonly shikimori: ShikimoriClient;
  private readonly logger: SearchLogger;
  private readonly cache = new TtlCache<SmartSearchResponse>(5 * 60_000, 128);
  private index: FuzzyTitleIndex | null = null;
  private indexBuiltAt = 0;
  private indexBuild: Promise<FuzzyTitleIndex> | null = null;

  constructor(deps: SearchServiceDeps) {
    this.prisma = deps.prisma;
    this.shikimori = deps.shikimori;
    this.logger = deps.logger;
  }

  async search(
    rawQuery: string,
    lang: Locale,
    limit: number,
    fast = false,
    allowAdult = false,
  ): Promise<SmartSearchResponse> {
    const query = rawQuery.trim();
    const key = `${fast ? "f" : "F"}:${lang}:${limit}:${allowAdult}:${query.toLowerCase()}`;
    return this.cache.wrap(key, () => this.run(query, lang, limit, fast, allowAdult));
  }

  private async run(
    query: string,
    lang: Locale,
    limit: number,
    fast: boolean,
    allowAdult: boolean,
  ): Promise<SmartSearchResponse> {
    const allowed = (rating: string | null) =>
      !isHentaiRating(rating) && (allowAdult || !isAdultRating(rating));

    // Instant typeahead: the local index first (sub-50ms), and only wait on one
    // upstream title call — with a hard timeout — when the cache is thin.
    if (fast) {
      const byTitle = (await this.titleFromCache(query)).filter((m) => allowed(m.summary.rating));
      // Typo guesses do not count towards "enough": if all we have is a
      // guess, the upstream search may well know the real spelling.
      const strong = byTitle.filter((m) => m.score >= STRONG_MATCH).length;
      const upstream = (
        strong >= 8
          ? []
          : await withTimeout(this.titleFromShikimori(query), 1400, [])
      ).filter((s) => allowed(s.rating));
      const byId = new Map<number, Candidate>();
      for (const m of byTitle) {
        byId.set(m.summary.id, {
          summary: m.summary,
          reason: "title",
          label: null,
          rank: m.score + (m.summary.members ?? 0) / 1e6,
        });
      }
      for (const s of upstream) {
        if (!byId.has(s.id)) {
          byId.set(s.id, {
            summary: s,
            reason: "title",
            label: null,
            rank: titleRank(s, query) - 5,
          });
        }
      }
      const flat = [...byId.values()].sort((a, b) => b.rank - a.rank).slice(0, limit);
      await this.attachPlayerFlags(flat.map((c) => c.summary));
      return {
        query,
        detectedGenres: [],
        groups: buildGroups(flat),
        flat: flat.map((c) => c.summary),
        total: flat.length,
      };
    }

    const mood = detectMood(query);

    const [byTitle, byTitleUpstream, byCharacter, byStudio, byMood, bySynopsis] =
      await Promise.all([
        this.titleFromCache(query),
        this.titleFromShikimori(query),
        this.fromCharacters(query),
        this.fromStudio(query),
        mood.genres.length > 0 ? this.fromMood(mood.genres) : Promise.resolve([]),
        this.fromSynopsis(query, lang),
      ]);

    // Merge with reason priority (title beats character beats mood beats synopsis).
    const byId = new Map<number, Candidate>();
    const consider = (
      summary: AnimeSummary,
      reason: SearchReason,
      rank: number,
      label: string | null = null,
    ) => {
      if (!allowed(summary.rating)) return;
      const existing = byId.get(summary.id);
      if (
        !existing ||
        REASON_PRIORITY[reason] < REASON_PRIORITY[existing.reason] ||
        (REASON_PRIORITY[reason] === REASON_PRIORITY[existing.reason] &&
          rank > existing.rank)
      ) {
        byId.set(summary.id, { summary, reason, label, rank });
      }
    };

    for (const m of byTitle) consider(m.summary, "title", m.score + (m.summary.members ?? 0) / 1e6);
    for (const s of byTitleUpstream) consider(s, "title", titleRank(s, query) - 5);
    for (const { anime, character } of byCharacter) {
      consider(anime, "character", 300 + (anime.members ?? 0) / 1e6, character);
    }
    for (const { anime, studio } of byStudio) {
      consider(anime, "studio", 250 + (anime.members ?? 0) / 1e6, studio);
    }
    for (const s of byMood) consider(s, "mood", 150 + (s.score ?? 0) * 8);
    for (const s of bySynopsis) consider(s, "synopsis", 100 + (s.score ?? 0) * 5);

    const candidates = [...byId.values()].sort((a, b) => b.rank - a.rank);
    const flat = candidates.slice(0, limit);

    await this.attachPlayerFlags(flat.map((c) => c.summary));

    const groups = buildGroups(flat);

    return {
      query,
      detectedGenres: mood.labels,
      groups,
      flat: flat.map((c) => c.summary),
      total: flat.length,
    };
  }

  // -- lenses --------------------------------------------------------

  /**
   * Title search over the local catalogue that forgives the way people
   * actually type: Latin for a Russian title or the other way round, the
   * wrong keyboard layout, words run together, a letter or two wrong. See
   * FuzzyTitleIndex — a plain SQL `contains` found none of those.
   */
  private async titleFromCache(query: string): Promise<TitleMatch[]> {
    const index = await this.titleIndex().catch((error) => {
      this.logger.warn({ error }, "title index build failed");
      return null;
    });
    if (!index) return [];
    const hits = index.search(query, 20);
    if (hits.length === 0) return [];
    const rows = await this.prisma.anime.findMany({
      where: { id: { in: hits.map((h) => h.id) } },
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const out: TitleMatch[] = [];
    for (const hit of hits) {
      const row = byId.get(hit.id);
      if (row) out.push({ summary: toSummaryDto(row), score: hit.score });
    }
    return out;
  }

  /**
   * The index lives in memory: a few thousand titles are a few hundred KB and
   * about 100ms to build. Rebuilt every ten minutes so newly cached titles
   * become findable; a stale index keeps answering while the next one builds,
   * and concurrent searches share one build rather than each starting their own.
   */
  private async titleIndex(): Promise<FuzzyTitleIndex> {
    const fresh = Date.now() - this.indexBuiltAt < INDEX_TTL_MS;
    if (this.index && fresh) return this.index;
    if (!this.indexBuild) {
      this.indexBuild = this.buildIndex().finally(() => {
        this.indexBuild = null;
      });
    }
    return this.index ?? this.indexBuild;
  }

  private async buildIndex(): Promise<FuzzyTitleIndex> {
    const rows = await this.prisma.anime.findMany({
      select: {
        id: true,
        members: true,
        title: true,
        titleEnglish: true,
        titleJapanese: true,
        titleLocalized: true,
      },
    });
    const index = new FuzzyTitleIndex(
      rows.map((r) => ({
        id: r.id,
        members: r.members,
        titles: [r.title, r.titleEnglish, r.titleJapanese, r.titleLocalized],
      })),
    );
    this.index = index;
    this.indexBuiltAt = Date.now();
    return index;
  }

  private async titleFromShikimori(query: string): Promise<AnimeSummary[]> {
    try {
      const list = await this.shikimori.listAnimes({
        search: query,
        limit: 14,
        order: "popularity",
      });
      const summaries = list.map(shikiToSummary);
      await persistAnimeSummaries(summaries).catch(() => undefined);
      return summaries;
    } catch (error) {
      this.logger.warn({ error, query }, "shikimori title search failed");
      return [];
    }
  }

  private async fromCharacters(
    query: string,
  ): Promise<Array<{ anime: AnimeSummary; character: string }>> {
    if (query.length < 3) return [];
    try {
      const found = await this.shikimori.searchCharacters(query);
      const out: Array<{ anime: AnimeSummary; character: string }> = [];

      // One extra upstream call, not three — the top match carries the search.
      for (const character of found.slice(0, 1)) {
        const detail = await this.shikimori.getCharacter(character.id).catch(() => null);
        const animes = detail?.animes ?? [];
        if (animes.length === 0) continue;
        const summaries = animes.slice(0, 6).map(shikiToSummary);
        await persistAnimeSummaries(summaries).catch(() => undefined);
        for (const summary of summaries) {
          out.push({ anime: summary, character: character.russian || character.name });
        }
      }
      return out;
    } catch (error) {
      this.logger.warn({ error, query }, "shikimori character search failed");
      return [];
    }
  }

  /**
   * Studio name search — no per-element case-insensitive match on a Postgres
   * `String[]` column via Prisma's own filter operators, so this scans the
   * (bounded, most-popular-first) cached catalogue in JS instead of raw SQL.
   * Fine at this catalogue's scale; revisit with a dedicated Studio table +
   * index if it ever needs to search beyond what's locally cached.
   */
  private async fromStudio(
    query: string,
  ): Promise<Array<{ anime: AnimeSummary; studio: string }>> {
    if (query.length < 3) return [];
    const q = query.toLowerCase();
    const rows = await this.prisma.anime.findMany({
      where: { studios: { isEmpty: false } },
      orderBy: { members: { sort: "desc", nulls: "last" } },
      take: 3000,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const out: Array<{ anime: AnimeSummary; studio: string }> = [];
    for (const row of rows) {
      const hit = row.studios.find((s) => s.toLowerCase().includes(q));
      if (hit) out.push({ anime: toSummaryDto(row), studio: hit });
      if (out.length >= 12) break;
    }
    return out;
  }

  private async fromMood(genres: string[]): Promise<AnimeSummary[]> {
    const rows = await this.prisma.anime.findMany({
      where: { genres: { some: { genre: { name: { in: genres } } } } },
      orderBy: { score: { sort: "desc", nulls: "last" } },
      take: 14,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    return rows.map(toSummaryDto);
  }

  private async fromSynopsis(query: string, lang: Locale): Promise<AnimeSummary[]> {
    if (query.length < 4) return [];

    const translated = await this.prisma.animeTranslation.findMany({
      where: {
        field: "synopsis",
        lang,
        value: { contains: query, mode: "insensitive" },
      },
      select: { animeId: true },
      take: 12,
    });

    const rows = await this.prisma.anime.findMany({
      where: {
        OR: [
          { synopsis: { contains: query, mode: "insensitive" } },
          { id: { in: translated.map((t) => t.animeId) } },
        ],
      },
      orderBy: { score: { sort: "desc", nulls: "last" } },
      take: 14,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    return rows.map(toSummaryDto);
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
}

/**
 * Ranks an upstream result on the same scale as the local index, comparing
 * the same normalised keys — so "shingeki no kyojin" typed with spaces still
 * counts as an exact hit on "Shingeki no Kyojin" from Shikimori.
 */
function titleRank(summary: AnimeSummary, query: string): number {
  const variants = queryVariants(query);
  const keys = [summary.title, summary.titleEnglish, summary.titleJapanese, summary.titleLocalized]
    .filter((n): n is string => Boolean(n))
    .map(titleKey);
  let best = 100;
  for (const key of keys) {
    for (const q of variants) {
      if (key === q) best = Math.max(best, 1000);
      else if (key.startsWith(q)) best = Math.max(best, 800);
      else if (key.includes(q)) best = Math.max(best, 600);
    }
  }
  return best + (summary.members ?? 0) / 1e6;
}

function buildGroups(candidates: Candidate[]): SearchGroup[] {
  const groups: SearchGroup[] = [];

  const titleItems = candidates
    .filter((c) => c.reason === "title")
    .map((c) => c.summary);
  if (titleItems.length > 0) {
    groups.push({ reason: "title", label: null, items: titleItems });
  }

  // One group per distinct character label.
  const characterGroups = new Map<string, AnimeSummary[]>();
  for (const c of candidates) {
    if (c.reason !== "character" || !c.label) continue;
    const list = characterGroups.get(c.label) ?? [];
    list.push(c.summary);
    characterGroups.set(c.label, list);
  }
  for (const [label, items] of characterGroups) {
    groups.push({ reason: "character", label, items });
  }

  // One group per distinct studio label.
  const studioGroups = new Map<string, AnimeSummary[]>();
  for (const c of candidates) {
    if (c.reason !== "studio" || !c.label) continue;
    const list = studioGroups.get(c.label) ?? [];
    list.push(c.summary);
    studioGroups.set(c.label, list);
  }
  for (const [label, items] of studioGroups) {
    groups.push({ reason: "studio", label, items });
  }

  const moodItems = candidates
    .filter((c) => c.reason === "mood")
    .map((c) => c.summary);
  if (moodItems.length > 0) {
    groups.push({ reason: "mood", label: null, items: moodItems });
  }

  const synopsisItems = candidates
    .filter((c) => c.reason === "synopsis")
    .map((c) => c.summary);
  if (synopsisItems.length > 0) {
    groups.push({ reason: "synopsis", label: null, items: synopsisItems });
  }

  return groups;
}
