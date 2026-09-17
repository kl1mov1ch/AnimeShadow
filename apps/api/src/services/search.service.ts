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
      const byTitle = (await this.titleFromCache(query)).filter((s) => allowed(s.rating));
      const upstream = (
        byTitle.length >= 8
          ? []
          : await withTimeout(this.titleFromShikimori(query), 1400, [])
      ).filter((s) => allowed(s.rating));
      const byId = new Map<number, Candidate>();
      for (const s of byTitle) {
        byId.set(s.id, { summary: s, reason: "title", label: null, rank: titleRank(s, query) });
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

    for (const s of byTitle) consider(s, "title", titleRank(s, query));
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

  private async titleFromCache(query: string): Promise<AnimeSummary[]> {
    const rows = await this.prisma.anime.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { titleEnglish: { contains: query, mode: "insensitive" } },
          { titleJapanese: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { members: { sort: "desc", nulls: "last" } },
      take: 20,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    return rows.map(toSummaryDto);
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

function titleRank(summary: AnimeSummary, query: string): number {
  const q = query.toLowerCase();
  const names = [summary.title, summary.titleEnglish, summary.titleJapanese]
    .filter((n): n is string => Boolean(n))
    .map((n) => n.toLowerCase());
  let best = 100;
  for (const name of names) {
    if (name === q) best = Math.max(best, 1000);
    else if (name.startsWith(q)) best = Math.max(best, 600);
    else if (name.includes(q)) best = Math.max(best, 300);
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
