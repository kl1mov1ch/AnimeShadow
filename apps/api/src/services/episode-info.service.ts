import { Prisma, type PrismaClient } from "@animeshadow/db";
import type { Locale } from "@animeshadow/shared";
import type { Translator } from "./translator.js";

interface InfoLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface EpisodeInfoDeps {
  prisma: PrismaClient;
  translator: Translator;
  translateEnabled: boolean;
  logger: InfoLogger;
  fetchImpl?: typeof fetch;
}

/** One episode, as stored and as served. */
export interface EpisodeInfo {
  number: number;
  title: string | null;
  titleJa: string | null;
  synopsis: string | null;
  thumb: string | null;
  airdate: string | null;
  /** Minutes, when Kitsu states it. */
  length: number | null;
}

const KITSU = "https://kitsu.io/api/edge";
const HEADERS = { accept: "application/vnd.api+json" };
/** Kitsu's own page ceiling. */
const PAGE = 20;
/** Enough for all but the very longest shows; those get their first 600. */
const MAX_PAGES = 30;
/** A finished show's list doesn't change; an airing one gains an episode a week. */
const FRESH_MS = { finished: 30 * 86_400_000, airing: 86_400_000 };
/** A failed lookup is retried after this, not on every page view. */
const RETRY_MS = 6 * 60 * 60_000;
/** Kept apart by a line no synopsis contains, so one request can carry many. */
const SEPARATOR = "\n\n⟦•⟧\n\n";
/** Google's free endpoint copes with a few thousand characters per call. */
const CHUNK_CHARS = 3_500;

interface KitsuEpisode {
  attributes: {
    number: number | null;
    canonicalTitle: string | null;
    titles: Record<string, string | null> | null;
    synopsis: string | null;
    description: string | null;
    airdate: string | null;
    length: number | null;
    thumbnail: { original?: string | null } | null;
  };
}

/**
 * What each episode is called and what happens in it.
 *
 * Our other sources know an episode by its number and, at most, a name
 * (AniLibria's). Kitsu publishes, per episode, its title, a synopsis, a
 * still and an air date — the source of the (i) on every episode row. The
 * list is fetched once and stored on the title, refreshed daily while the
 * show airs and monthly after; a lookup that failed is not retried on
 * every page view.
 *
 * Kitsu writes in English. For Russian the titles and synopses go through
 * the site's existing translator and translation cache, in the background:
 * the first visitor gets English, everyone after gets Russian.
 */
export class EpisodeInfoService {
  private readonly prisma: PrismaClient;
  private readonly translator: Translator;
  private readonly translateEnabled: boolean;
  private readonly logger: InfoLogger;
  private readonly fetchImpl: typeof fetch;
  private readonly inflight = new Map<number, Promise<EpisodeInfo[]>>();
  private readonly translating = new Set<number>();
  private readonly failedAt = new Map<number, number>();

  constructor(deps: EpisodeInfoDeps) {
    this.prisma = deps.prisma;
    this.translator = deps.translator;
    this.translateEnabled = deps.translateEnabled;
    this.logger = deps.logger;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  }

  async get(animeId: number, lang: Locale): Promise<EpisodeInfo[]> {
    const row = await this.prisma.anime.findUnique({
      where: { id: animeId },
      select: { episodeInfo: true, episodeInfoAt: true, airing: true },
    });
    if (!row) return [];

    const stored = (row.episodeInfo as EpisodeInfo[] | null) ?? null;
    const maxAge = row.airing === "AIRING" ? FRESH_MS.airing : FRESH_MS.finished;
    const stale = !row.episodeInfoAt || Date.now() - row.episodeInfoAt.getTime() > maxAge;
    const recentlyFailed = Date.now() - (this.failedAt.get(animeId) ?? 0) < RETRY_MS;

    let episodes = stored ?? [];
    if (stale && !recentlyFailed) {
      if (stored) {
        // Serve what we have; refresh behind it.
        void this.refresh(animeId).catch(() => undefined);
      } else {
        episodes = await this.refresh(animeId).catch(() => []);
      }
    }

    if (lang === "ru" && episodes.length > 0) return this.localize(animeId, episodes);
    return episodes;
  }

  private refresh(animeId: number): Promise<EpisodeInfo[]> {
    const running = this.inflight.get(animeId);
    if (running) return running;
    const task = this.fetchFromKitsu(animeId)
      .then(async (episodes) => {
        await this.prisma.anime.update({
          where: { id: animeId },
          data: {
            episodeInfo: episodes.length > 0 ? (episodes as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            episodeInfoAt: new Date(),
          },
        });
        this.failedAt.delete(animeId);
        return episodes;
      })
      .catch((error) => {
        this.failedAt.set(animeId, Date.now());
        this.logger.warn({ error, animeId }, "episode info lookup failed");
        throw error;
      })
      .finally(() => this.inflight.delete(animeId));
    this.inflight.set(animeId, task);
    return task;
  }

  private async kitsu<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${KITSU}${path}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`kitsu ${response.status}`);
    return (await response.json()) as T;
  }

  private async fetchFromKitsu(malId: number): Promise<EpisodeInfo[]> {
    // Our ids are MyAnimeList's; Kitsu keeps the mapping.
    const mapping = await this.kitsu<{ included?: Array<{ id: string; type: string }> }>(
      `/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${malId}&include=item`,
    );
    const kitsuId = mapping.included?.find((item) => item.type === "anime")?.id;
    if (!kitsuId) return [];

    const first = await this.kitsu<{ data: KitsuEpisode[]; meta?: { count?: number } }>(
      `/anime/${kitsuId}/episodes?page[limit]=${PAGE}&page[offset]=0&sort=number`,
    );
    const total = Math.min(first.meta?.count ?? first.data.length, PAGE * MAX_PAGES);
    const pages = [first.data];
    // The rest a few at a time — Kitsu is generous but not unlimited.
    const offsets: number[] = [];
    for (let offset = PAGE; offset < total; offset += PAGE) offsets.push(offset);
    for (let i = 0; i < offsets.length; i += 4) {
      const batch = await Promise.all(
        offsets.slice(i, i + 4).map((offset) =>
          this.kitsu<{ data: KitsuEpisode[] }>(
            `/anime/${kitsuId}/episodes?page[limit]=${PAGE}&page[offset]=${offset}&sort=number`,
          ).then((r) => r.data),
        ),
      );
      pages.push(...batch);
    }

    const byNumber = new Map<number, EpisodeInfo>();
    for (const episode of pages.flat()) {
      const a = episode.attributes;
      if (a.number == null || a.number <= 0 || byNumber.has(a.number)) continue;
      const titles = a.titles ?? {};
      byNumber.set(a.number, {
        number: a.number,
        title: clean(a.canonicalTitle ?? titles.en ?? titles.en_us ?? null),
        titleJa: clean(titles.ja_jp ?? null),
        synopsis: clean(a.synopsis ?? a.description ?? null),
        thumb: a.thumbnail?.original ?? null,
        airdate: a.airdate ?? null,
        length: a.length ?? null,
      });
    }
    return [...byNumber.values()].sort((x, y) => x.number - y.number);
  }

  /**
   * Russian titles and synopses from the translation cache, and a
   * background pass to fill whatever isn't cached yet.
   */
  private async localize(animeId: number, episodes: EpisodeInfo[]): Promise<EpisodeInfo[]> {
    const cached = await this.prisma.animeTranslation.findMany({
      where: { animeId, lang: "ru", field: { startsWith: "ep:" } },
      select: { field: true, value: true },
    });
    const store = new Map(cached.map((row) => [row.field, row.value]));

    const missing = episodes.some(
      (e) => (e.title && !store.has(`ep:${e.number}:title`)) || (e.synopsis && !store.has(`ep:${e.number}:synopsis`)),
    );
    if (missing && this.translateEnabled && !this.translating.has(animeId)) {
      this.translating.add(animeId);
      void this.translateAll(animeId, episodes, store)
        .catch((error) => this.logger.warn({ error, animeId }, "episode translation failed"))
        .finally(() => this.translating.delete(animeId));
    }

    return episodes.map((e) => ({
      ...e,
      title: store.get(`ep:${e.number}:title`) ?? e.title,
      synopsis: store.get(`ep:${e.number}:synopsis`) ?? e.synopsis,
    }));
  }

  private async translateAll(
    animeId: number,
    episodes: EpisodeInfo[],
    store: Map<string, string>,
  ): Promise<void> {
    const jobs: Array<{ field: string; text: string }> = [];
    for (const e of episodes) {
      if (e.title && !store.has(`ep:${e.number}:title`)) jobs.push({ field: `ep:${e.number}:title`, text: e.title });
      if (e.synopsis && !store.has(`ep:${e.number}:synopsis`)) jobs.push({ field: `ep:${e.number}:synopsis`, text: e.synopsis });
    }

    // Many short texts per request, split on a marker, rather than one
    // request per text — a 28-episode show is a handful of calls, not 56.
    let chunk: typeof jobs = [];
    let size = 0;
    const flush = async () => {
      if (chunk.length === 0) return;
      const batch = chunk;
      chunk = [];
      size = 0;
      const joined = batch.map((j) => j.text).join(SEPARATOR);
      const translated = await this.translator.translate(joined, "en", "ru");
      if (!translated) return;
      const parts = translated.split(/\s*⟦•⟧\s*/);
      // If the marker didn't survive the round trip the parts can't be
      // matched up safely — skip the batch rather than misfile a synopsis.
      if (parts.length !== batch.length) return;
      await this.prisma.animeTranslation.createMany({
        data: batch.map((job, i) => ({
          animeId,
          lang: "ru",
          field: job.field,
          value: parts[i]!.trim(),
        })),
        skipDuplicates: true,
      });
    };
    for (const job of jobs) {
      if (size + job.text.length > CHUNK_CHARS) await flush();
      chunk.push(job);
      size += job.text.length + SEPARATOR.length;
    }
    await flush();
  }
}

/** Kitsu leaves source credits in synopses: "(Source: Crunchyroll)". */
function clean(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text
    .replace(/\s*\((?:source|written by)[^)]*\)\s*$/i, "")
    .replace(/\s*\[(?:source|written by)[^\]]*\]\s*$/i, "")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}
