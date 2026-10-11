import {
  ANIME_WITH_GENRES_INCLUDE,
  type Prisma,
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
  ParsedSearch,
  SearchGroup,
  SearchReason,
  SearchScope,
  SmartSearchResponse,
} from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { isAdultRating, isHentaiRating, withContentGuard } from "../lib/content-guard.js";
import { FuzzyTitleIndex, queryVariants, titleKey } from "../lib/fuzzy-title.js";
import { fitsFilters, hasFilters, type ParsedQuery, parseQuery } from "../lib/search-query.js";
import { withTimeout } from "../lib/timeout.js";
import { TITLE_ALIASES } from "../lib/title-aliases.js";
import { detectMood } from "./mood-keywords.js";

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
  /** The name it matched by. */
  matched: string;
}

/** The catalogue's names and studios, in memory. */
interface SearchIndex {
  titles: FuzzyTitleIndex;
  /** Each studio once, with its titles best-known first. */
  studios: Array<{ name: string; key: string; ids: number[] }>;
}

/** How long the in-memory index is trusted before it is rebuilt. */
const INDEX_TTL_MS = 10 * 60_000;

/**
 * A local match this good means the person typed the name correctly; below
 * it, the local catalogue only guessed at a typo and upstream deserves a look.
 */
const STRONG_MATCH = 600;

const REASON_PRIORITY: Record<SearchReason, number> = {
  title: 0,
  similar: 1,
  character: 2,
  studio: 3,
  mood: 4,
  filters: 5,
  synopsis: 6,
};

/**
 * Smart search: one query, several lenses — title (every name a title goes
 * by, typos and the wrong keyboard layout forgiven), character, studio,
 * mood, plot — merged, de-duplicated and ranked.
 *
 * The query is read first (lib/search-query): a year or a decade, a format
 * and "still airing" become filters on every lens ("фильмы 2020",
 * "онгоинги романтика"); "похоже на Наруто" becomes the titles like it. A
 * scope narrows it to one lens, which is also less work.
 *
 * Kept light: the names and studios are searched in memory (the index is
 * rebuilt every ten minutes, one query), the typeahead (`fast`) never waits
 * on more than one upstream call, and answers are cached for five minutes.
 */
export class SearchService {
  private readonly prisma: PrismaClient;
  private readonly shikimori: ShikimoriClient;
  private readonly logger: SearchLogger;
  private readonly cache = new TtlCache<SmartSearchResponse>(5 * 60_000, 256);
  private readonly similarCache = new TtlCache<AnimeSummary[]>(12 * 60 * 60_000, 400);
  private index: SearchIndex | null = null;
  private indexBuiltAt = 0;
  private indexBuild: Promise<SearchIndex> | null = null;

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
    scope: SearchScope = "all",
  ): Promise<SmartSearchResponse> {
    const query = rawQuery.trim();
    const key = `${fast ? "f" : "F"}:${scope}:${lang}:${limit}:${allowAdult}:${query.toLowerCase()}`;
    return this.cache.wrap(key, () => this.run(query, lang, limit, fast, allowAdult, scope));
  }

  private async run(
    query: string,
    lang: Locale,
    limit: number,
    fast: boolean,
    allowAdult: boolean,
    scope: SearchScope,
  ): Promise<SmartSearchResponse> {
    const parsed = parseQuery(query);
    const allowed = (rating: string | null) => !isHentaiRating(rating) && (allowAdult || !isAdultRating(rating));
    const fits = (summary: AnimeSummary) => allowed(summary.rating) && fitsFilters(parsed, summary);

    const byId = new Map<number, Candidate>();
    const matchedAs = new Map<number, { name: string; score: number }>();
    const consider = (summary: AnimeSummary, reason: SearchReason, rank: number, label: string | null = null) => {
      if (!fits(summary)) return;
      const existing = byId.get(summary.id);
      if (
        !existing ||
        REASON_PRIORITY[reason] < REASON_PRIORITY[existing.reason] ||
        (REASON_PRIORITY[reason] === REASON_PRIORITY[existing.reason] && rank > existing.rank)
      ) {
        byId.set(summary.id, { summary, reason, label, rank });
      }
    };
    const out: ParsedSearch = {
      rest: parsed.rest,
      yearFrom: parsed.yearFrom,
      yearTo: parsed.yearTo,
      type: parsed.type,
      airing: parsed.airing,
      similarTo: null,
    };
    let detected: string[] = [];

    if (parsed.similar) {
      // "похоже на Наруто": the title named, then what is like it.
      const anchor = await this.anchorFor(parsed.similar, allowed);
      if (anchor) {
        out.similarTo = { id: anchor.id, slug: anchor.slug, title: anchor.titleLocalized ?? anchor.title };
        const similar = await this.similarTo(anchor.id);
        similar.forEach((s, i) => consider(s, "similar", 500 - i, out.similarTo!.title));
      }
    } else {
      const text = parsed.rest;
      const want = (lens: SearchScope) => scope === "all" || scope === lens;
      const mood = text && scope === "all" ? detectMood(text) : { genres: [], labels: [] };
      detected = mood.labels;
      // Character, studio and plot are asked by name — the typeahead's
      // `fast` only ever limits "all".
      const deep = !fast || scope !== "all";

      const local = text.length >= 1 && want("title") ? this.titleFromIndex(text) : Promise.resolve([] as TitleMatch[]);
      const [titles, upstream, characters, studios, moodHits, plot, filtered] = await Promise.all([
        local,
        // Shikimori's own search — in the typeahead only when the local
        // catalogue has little, and never for longer than 1.4 s.
        text.length >= 2 && want("title")
          ? local.then((hits) => {
              const strong = hits.filter((m) => m.score >= STRONG_MATCH && fits(m.summary)).length;
              if (fast && strong >= 6) return [];
              return fast ? withTimeout(this.titleFromShikimori(text), 1400, []) : this.titleFromShikimori(text);
            })
          : Promise.resolve([] as AnimeSummary[]),
        deep && want("character") && text.length >= 3 ? this.fromCharacters(text) : Promise.resolve([]),
        deep && want("studio") && text.length >= 2 ? this.fromStudio(text) : Promise.resolve([]),
        mood.genres.length > 0 ? this.fromMood(mood.genres, parsed, allowAdult) : Promise.resolve([]),
        deep && want("plot") && text.length >= 4 ? this.fromSynopsis(text, lang, allowAdult) : Promise.resolve([]),
        // Nothing but filters ("фильмы 2020", "онгоинги"): the best titles that fit.
        hasFilters(parsed) && (text.length === 0 || mood.genres.length > 0)
          ? this.fromFilters(parsed, mood.genres, allowAdult)
          : Promise.resolve([]),
      ]);

      for (const m of titles) {
        consider(m.summary, "title", m.score + fame(m.summary) / 1e7);
        matchedAs.set(m.summary.id, { name: m.matched, score: m.score });
      }
      for (const s of upstream) consider(s, "title", titleRank(s, text) - 5);
      for (const { anime, character } of characters) {
        consider(anime, "character", 300 + fame(anime) / 1e7, character);
      }
      for (const { anime, studio } of studios) {
        consider(anime, "studio", 250 + fame(anime) / 1e7, studio);
      }
      for (const s of moodHits) consider(s, "mood", 150 + (s.score ?? 0) * 8);
      for (const s of filtered) consider(s, "filters", 140 + (s.score ?? 0) * 6 + Math.log10(fame(s) + 1));
      for (const s of plot) consider(s, "synopsis", 100 + (s.score ?? 0) * 5);
    }

    const candidates = [...byId.values()].sort((a, b) => b.rank - a.rank);
    const flat = candidates.slice(0, limit);
    await this.attachPlayerFlags(flat.map((c) => c.summary));

    // The other name a title was found by, when it is not one shown anyway —
    // only for a whole name or its start: a few letters found in the middle
    // of a transliterated name ("aot" in "shkolaotchayaniya") explain nothing.
    const aka: Record<string, string> = {};
    for (const c of flat) {
      const hit = matchedAs.get(c.summary.id);
      if (!hit || hit.score < 800 || c.reason !== "title") continue;
      const name = hit.name;
      const shown = [c.summary.title, c.summary.titleLocalized, c.summary.titleEnglish].filter(Boolean) as string[];
      if (!shown.some((s) => titleKey(s) === titleKey(name))) aka[String(c.summary.id)] = name;
    }

    return {
      query,
      detectedGenres: detected,
      groups: buildGroups(flat),
      flat: flat.map((c) => c.summary),
      total: flat.length,
      parsed: out,
      aka,
    };
  }

  // -- lenses --------------------------------------------------------

  /**
   * Title search over the local catalogue that forgives the way people
   * actually type: Latin for a Russian title or the other way round, the
   * wrong keyboard layout, words run together, a letter or two wrong — and
   * every other name a title goes by (synonyms, abbreviations, nicknames).
   * See FuzzyTitleIndex — a plain SQL `contains` found none of those.
   */
  private async titleFromIndex(query: string): Promise<TitleMatch[]> {
    const index = await this.searchIndex().catch((error) => {
      this.logger.warn({ error }, "search index build failed");
      return null;
    });
    if (!index) return [];
    const hits = index.titles.search(query, 20);
    if (hits.length === 0) return [];
    const rows = await this.prisma.anime.findMany({
      where: { id: { in: hits.map((h) => h.id) } },
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const out: TitleMatch[] = [];
    for (const hit of hits) {
      const row = byId.get(hit.id);
      if (row) out.push({ summary: toSummaryDto(row), score: hit.score, matched: hit.matched });
    }
    return out;
  }

  /**
   * The index lives in memory: a few thousand titles are a few hundred KB and
   * about 100ms to build. Rebuilt every ten minutes so newly cached titles
   * (and newly read names) become findable; a stale index keeps answering
   * while the next one builds, and concurrent searches share one build.
   */
  private async searchIndex(): Promise<SearchIndex> {
    const fresh = Date.now() - this.indexBuiltAt < INDEX_TTL_MS;
    if (this.index && fresh) return this.index;
    if (!this.indexBuild) {
      this.indexBuild = this.buildIndex().finally(() => {
        this.indexBuild = null;
      });
    }
    return this.index ?? this.indexBuild;
  }

  private async buildIndex(): Promise<SearchIndex> {
    const rows = await this.prisma.anime.findMany({
      select: {
        id: true,
        members: true,
        scoredBy: true,
        title: true,
        titleEnglish: true,
        titleJapanese: true,
        titleLocalized: true,
        titleSynonyms: true,
        studios: true,
      },
    });
    const titles = new FuzzyTitleIndex(
      rows.map((r) => ({
        id: r.id,
        members: fame(r),
        // The title's own names first: on a tie, the match shown is one of them.
        titles: [r.titleLocalized, r.title, r.titleEnglish, r.titleJapanese, ...r.titleSynonyms, ...(TITLE_ALIASES[r.id] ?? [])],
      })),
    );
    const studioMap = new Map<string, { name: string; ids: Array<{ id: number; members: number }> }>();
    for (const r of rows) {
      for (const studio of r.studios) {
        const key = titleKey(studio);
        if (!key) continue;
        const entry = studioMap.get(key) ?? { name: studio, ids: [] };
        entry.ids.push({ id: r.id, members: fame(r) });
        studioMap.set(key, entry);
      }
    }
    const studios = [...studioMap.entries()].map(([key, s]) => ({
      name: s.name,
      key,
      ids: s.ids.sort((a, b) => b.members - a.members).map((x) => x.id),
    }));
    const index = { titles, studios };
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

  /** The title "похоже на X" means: the best local match, else Shikimori's. */
  private async anchorFor(text: string, allowed: (rating: string | null) => boolean): Promise<AnimeSummary | null> {
    const local = (await this.titleFromIndex(text)).filter((m) => allowed(m.summary.rating));
    if (local[0] && local[0].score >= STRONG_MATCH) return local[0].summary;
    const upstream = (await withTimeout(this.titleFromShikimori(text), 2500, [])).filter((s) => allowed(s.rating));
    return upstream[0] ?? local[0]?.summary ?? null;
  }

  /** Titles Shikimori's users found similar — kept twelve hours. */
  private similarTo(id: number): Promise<AnimeSummary[]> {
    return this.similarCache.wrap(String(id), async () => {
      try {
        const list = await this.shikimori.getSimilar(id);
        const summaries = list.slice(0, 24).map(shikiToSummary);
        await persistAnimeSummaries(summaries).catch(() => undefined);
        // Our own rows where we have them: genres, year and flags filled in.
        const rows = await this.prisma.anime.findMany({
          where: { id: { in: summaries.map((s) => s.id) } },
          include: ANIME_WITH_GENRES_INCLUDE,
        });
        const byId = new Map(rows.map((r) => [r.id, toSummaryDto(r)]));
        return summaries.map((s) => byId.get(s.id) ?? s);
      } catch (error) {
        this.logger.warn({ error, id }, "shikimori similar failed");
        return [];
      }
    });
  }

  private async fromCharacters(
    query: string,
  ): Promise<Array<{ anime: AnimeSummary; character: string }>> {
    try {
      const found = await this.shikimori.searchCharacters(query);
      const out: Array<{ anime: AnimeSummary; character: string }> = [];

      // The two best matches, not one: several characters share a name
      // ("Гоку" is someone besides Son Goku), and the better-known one may
      // be second. Two extra upstream calls at most.
      const details = await Promise.all(
        found.slice(0, 2).map((character) =>
          this.shikimori.getCharacter(character.id).then(
            (detail) => ({ character, animes: detail?.animes ?? [] }),
            () => ({ character, animes: [] }),
          ),
        ),
      );
      for (const { character, animes } of details) {
        if (animes.length === 0) continue;
        const summaries = animes.slice(0, 8).map(shikiToSummary);
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

  /** Studios by name, from the in-memory index: no table scan per query. */
  private async fromStudio(query: string): Promise<Array<{ anime: AnimeSummary; studio: string }>> {
    const index = await this.searchIndex().catch(() => null);
    if (!index) return [];
    const variants = queryVariants(query);
    const matches = index.studios
      .map((s) => ({
        studio: s,
        score: variants.some((v) => s.key === v) ? 2 : variants.some((v) => v.length >= 3 && s.key.includes(v)) ? 1 : 0,
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score || b.studio.ids.length - a.studio.ids.length)
      .slice(0, 3);
    if (matches.length === 0) return [];
    const picks: Array<{ id: number; studio: string }> = [];
    for (const { studio } of matches) {
      for (const id of studio.ids.slice(0, 12)) picks.push({ id, studio: studio.name });
    }
    const rows = await this.prisma.anime.findMany({
      where: { id: { in: picks.map((p) => p.id) } },
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, toSummaryDto(r)]));
    return picks.flatMap((p) => {
      const anime = byId.get(p.id);
      return anime ? [{ anime, studio: p.studio }] : [];
    });
  }

  private async fromMood(genres: string[], parsed: ParsedQuery, allowAdult: boolean): Promise<AnimeSummary[]> {
    const rows = await this.prisma.anime.findMany({
      where: withContentGuard({ genres: { some: { genre: { name: { in: genres } } } }, ...filterWhere(parsed) }, allowAdult),
      orderBy: { score: { sort: "desc", nulls: "last" } },
      take: 14,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    return rows.map(toSummaryDto);
  }

  private async fromFilters(parsed: ParsedQuery, genres: string[], allowAdult: boolean): Promise<AnimeSummary[]> {
    const where: Prisma.AnimeWhereInput = {
      ...filterWhere(parsed),
      ...(genres.length > 0 ? { genres: { some: { genre: { name: { in: genres } } } } } : {}),
      // Titles people actually know, not every three-minute special.
      ...(parsed.airing === "UPCOMING" ? {} : { OR: [{ members: { gte: 2000 } }, { scoredBy: { gte: 2000 } }] }),
    };
    const rows = await this.prisma.anime.findMany({
      where: withContentGuard(where, allowAdult),
      orderBy: [{ scoredBy: { sort: "desc", nulls: "last" } }, { members: { sort: "desc", nulls: "last" } }],
      take: 24,
      include: ANIME_WITH_GENRES_INCLUDE,
    });
    return rows.map(toSummaryDto);
  }

  private async fromSynopsis(query: string, lang: Locale, allowAdult: boolean): Promise<AnimeSummary[]> {
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
      where: withContentGuard(
        {
          OR: [
            { synopsis: { contains: query, mode: "insensitive" } },
            { id: { in: translated.map((t) => t.animeId) } },
          ],
        },
        allowAdult,
      ),
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

/** How well known a title is: its list count where we have it, else how
 *  many rated it (the one every row has). */
function fame(anime: { members: number | null; scoredBy?: number | null }): number {
  return anime.members ?? anime.scoredBy ?? 0;
}

/** The query's filters as a Prisma `where`. */
function filterWhere(parsed: ParsedQuery): Prisma.AnimeWhereInput {
  return {
    ...(parsed.type ? { type: parsed.type } : {}),
    ...(parsed.airing ? { airing: parsed.airing } : {}),
    ...(parsed.yearFrom != null ? { year: { gte: parsed.yearFrom, lte: parsed.yearTo ?? parsed.yearFrom } } : {}),
  };
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
  return best + fame(summary) / 1e7;
}

/** Groups in the order of REASON_PRIORITY; one per character and per studio. */
function buildGroups(candidates: Candidate[]): SearchGroup[] {
  const groups: SearchGroup[] = [];
  const order: SearchReason[] = ["title", "similar", "character", "studio", "mood", "filters", "synopsis"];
  for (const reason of order) {
    const labelled = reason === "character" || reason === "studio" || reason === "similar";
    const buckets = new Map<string, AnimeSummary[]>();
    for (const c of candidates) {
      if (c.reason !== reason) continue;
      const label = labelled ? (c.label ?? "") : "";
      const list = buckets.get(label) ?? [];
      list.push(c.summary);
      buckets.set(label, list);
    }
    for (const [label, items] of buckets) {
      groups.push({ reason, label: labelled ? label || null : null, items });
    }
  }
  return groups;
}
