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

interface RawEpisode {
  ordinal: number;
  hls_480?: string | null;
  hls_720?: string | null;
  hls_1080?: string | null;
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
        })),
      };
    } catch {
      return null;
    }
  }
}

/** Best available quality for one episode, highest resolution first. */
export function bestEpisodeUrl(episode: AniLibriaEpisode): string | null {
  return episode.hls1080 ?? episode.hls720 ?? episode.hls480 ?? null;
}
