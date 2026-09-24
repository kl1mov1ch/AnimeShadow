// AniLibria (now hosted at anilibria.top, API v1 — the older api.anilibria.tv
// v3 this project briefly targeted was retired mid-2026) — a Russian fan-dub
// aggregator with a genuinely public, tokenless API and, unlike Kodik/Alloha,
// real per-episode HLS manifest URLs instead of a single "whole series"
// iframe. Every release search result carries the title's actual MyAnimeList
// id, so matching to our own catalogue (which uses the same numbering) is
// exact — no fuzzy name-matching needed, just a name search to find the
// candidate followed by an id check.

export interface AniLibriaClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** One playable episode, every quality AniLibria actually encoded for it. */
export interface AniLibriaEpisode {
  ordinal: number;
  hls480: string | null;
  hls720: string | null;
  hls1080: string | null;
  /** The episode's own title, when the release team filled it in. */
  name: string | null;
  nameEnglish: string | null;
  /** This episode's real length in seconds — not the title-wide average. */
  durationSeconds: number | null;
  /** A small still of this episode, absolute URL. */
  thumb: string | null;
  /** Where the opening sits, in seconds, when it was marked. */
  opening: { start: number; stop: number } | null;
}

/** Enough of a release to decide whether it's usable, plus its episode list. */
export interface AniLibriaRelease {
  id: number;
  malId: number | null;
  episodesTotal: number | null;
  isBlockedByGeo: boolean;
  isBlockedByCopyrights: boolean;
  episodes: AniLibriaEpisode[];
}

interface RawSearchEntry {
  id: number;
  mal?: { id?: number } | null;
  shikimori?: { id?: number } | null;
}

interface RawPreview {
  src?: string | null;
  thumbnail?: string | null;
  optimized?: { src?: string | null; thumbnail?: string | null } | null;
}

interface RawEpisode {
  ordinal: number;
  hls_480?: string | null;
  hls_720?: string | null;
  hls_1080?: string | null;
  name?: string | null;
  name_english?: string | null;
  duration?: number | null;
  preview?: RawPreview | null;
  opening?: { start?: number | null; stop?: number | null } | null;
}

interface RawRelease {
  id: number;
  mal?: { id?: number } | null;
  shikimori?: { id?: number } | null;
  episodes_total?: number | null;
  is_blocked_by_geo?: boolean;
  is_blocked_by_copyrights?: boolean;
  episodes?: RawEpisode[];
}

const DEFAULTS = {
  baseUrl: "https://anilibria.top/api/v1",
  timeoutMs: 8_000,
};

export class AniLibriaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AniLibriaClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /**
   * Finds the release matching `malId`, trying each of `titles` in turn as a
   * search term until one of them actually surfaces it — a search only
   * proposes candidates, the id is what confirms the match. Returns null if
   * nothing under any title comes back with a matching id, or the match is
   * geo/copyright blocked (functionally unusable either way).
   */
  async findByMalId(titles: string[], malId: number): Promise<AniLibriaRelease | null> {
    for (const title of titles) {
      const trimmed = title.trim();
      if (trimmed.length < 2) continue;
      const candidates = await this.searchReleases(trimmed);
      const hit = candidates.find(
        (c) => c.mal?.id === malId || c.shikimori?.id === malId,
      );
      if (!hit) continue;
      const detail = await this.getRelease(hit.id);
      if (!detail) return null;
      if (detail.isBlockedByGeo || detail.isBlockedByCopyrights) return null;
      return detail;
    }
    return null;
  }

  private async searchReleases(query: string): Promise<RawSearchEntry[]> {
    try {
      const url = new URL(`${this.baseUrl}/app/search/releases`);
      url.searchParams.set("query", query);
      const response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: "application/json" },
      });
      if (!response.ok) return [];
      const body = (await response.json().catch(() => null)) as unknown;
      return Array.isArray(body) ? (body as RawSearchEntry[]) : [];
    } catch {
      return [];
    }
  }

  /** Storage paths come back site-relative; the page needs them whole. */
  private absolute(path: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//.test(path)) return path;
    return `${new URL(this.baseUrl).origin}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  private async getRelease(id: number): Promise<AniLibriaRelease | null> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/anime/releases/${id}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: "application/json" },
      });
      if (!response.ok) return null;
      const raw = (await response.json().catch(() => null)) as RawRelease | null;
      if (!raw) return null;
      return {
        id: raw.id,
        malId: raw.mal?.id ?? raw.shikimori?.id ?? null,
        episodesTotal: raw.episodes_total ?? null,
        isBlockedByGeo: raw.is_blocked_by_geo ?? false,
        isBlockedByCopyrights: raw.is_blocked_by_copyrights ?? false,
        episodes: (raw.episodes ?? []).map((e) => ({
          ordinal: e.ordinal,
          hls480: e.hls_480 ?? null,
          hls720: e.hls_720 ?? null,
          hls1080: e.hls_1080 ?? null,
          name: e.name?.trim() || null,
          nameEnglish: e.name_english?.trim() || null,
          durationSeconds:
            typeof e.duration === "number" && e.duration > 0 ? e.duration : null,
          thumb: this.absolute(
            // The optimised webp thumbnail first: a few KB against the
            // original's few hundred, and it is what a 64px row needs.
            e.preview?.optimized?.thumbnail ??
              e.preview?.thumbnail ??
              e.preview?.src ??
              null,
          ),
          opening: openingOf(e.opening),
        })),
      };
    } catch {
      return null;
    }
  }
}

/**
 * An opening marker only when both ends are there and make sense — a lone
 * start, or a stop before its start, would put a skip button in the wrong
 * place, which is worse than not offering one.
 */
function openingOf(
  raw: { start?: number | null; stop?: number | null } | null | undefined,
): { start: number; stop: number } | null {
  const start = raw?.start;
  const stop = raw?.stop;
  if (typeof start !== "number" || typeof stop !== "number") return null;
  if (start < 0 || stop <= start) return null;
  return { start, stop };
}

/** Best available quality for one episode, highest resolution first. */
export function bestEpisodeUrl(episode: AniLibriaEpisode): string | null {
  return episode.hls1080 ?? episode.hls720 ?? episode.hls480 ?? null;
}
