// AniList (https://anilist.co) — a public, tokenless GraphQL API. Every Media
// node carries the MyAnimeList id it corresponds to (`idMal`), which is the
// same numbering this project keys its catalogue on, so matching is exact and
// needs no fuzzy name comparison; a title search only exists as a fallback for
// the handful of entries AniList has not cross-referenced.
//
// What it is here for, specifically: it holds the best artwork of any source
// we talk to (460x650 covers and true widescreen banners, against Shikimori's
// 225px-wide posters), it reports each cover's dominant colour, and it knows
// the next airing episode — which neither Shikimori nor Jikan expose.

export interface AniListClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Minimum gap between requests. See the note on the limiter below. */
  minIntervalMs?: number;
}

/** One cover/banner set, already stripped of AniList's placeholder art. */
export interface AniListArtwork {
  cover: string | null;
  banner: string | null;
  /** Dominant colour of the cover, as `#rrggbb`. */
  color: string | null;
}

export interface AniListTag {
  name: string;
  /** How well the tag fits this title, 0-100, per AniList's own voters. */
  rank: number;
}

export interface AniListStreamingLink {
  site: string;
  url: string;
  language: string | null;
}

export interface AniListMedia {
  id: number;
  idMal: number | null;
  artwork: AniListArtwork;
  nextEpisode: { episode: number; airingAt: string } | null;
  /** Spoiler tags removed, weak matches dropped, strongest first. */
  tags: AniListTag[];
  /** Official, legal places to watch. Fan sites are not included by AniList. */
  streamingLinks: AniListStreamingLink[];
}

export interface AniListTrendingEntry {
  idMal: number;
  trending: number;
  artwork: AniListArtwork;
}

const DEFAULTS = {
  baseUrl: "https://graphql.anilist.co",
  timeoutMs: 8_000,
  // AniList's documented ceiling is 90 requests/minute, and it degrades to a
  // lower one under load. 750ms between requests keeps us under that without
  // needing to track a window, which matters because this client is called
  // from background heal passes that would otherwise burst.
  minIntervalMs: 750,
};

/** AniList serves this when a title has no real cover of its own. */
function realArt(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.includes("default.jpg") ? null : url;
}

interface RawMedia {
  id?: number;
  idMal?: number | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    color?: string | null;
  } | null;
  bannerImage?: string | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  tags?: Array<{
    name?: string;
    rank?: number | null;
    isGeneralSpoiler?: boolean;
    isMediaSpoiler?: boolean;
  }> | null;
  externalLinks?: Array<{
    site?: string;
    url?: string;
    type?: string | null;
    language?: string | null;
  }> | null;
  trending?: number | null;
}

const MEDIA_FIELDS = `
  id
  idMal
  coverImage { extraLarge large color }
  bannerImage
  nextAiringEpisode { episode airingAt }
  tags { name rank isGeneralSpoiler isMediaSpoiler }
  externalLinks { site url type language }
`;

export class AniListClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;

  /** Tail of the request chain — see `schedule`. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: AniListClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULTS.baseUrl;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
  }

  /**
   * Full record for one title. Tries the exact `idMal` match first and only
   * falls back to a name search if AniList has no cross-reference for it —
   * a search can return the wrong show, an id cannot.
   */
  async getByMalId(malId: number, titleFallback?: string): Promise<AniListMedia | null> {
    const byId = await this.query<{ Media?: RawMedia | null }>(
      `query($idMal:Int){ Media(idMal:$idMal,type:ANIME){ ${MEDIA_FIELDS} } }`,
      { idMal: malId },
    );
    const media = byId?.Media;
    if (media) return toMedia(media);

    const title = titleFallback?.trim();
    if (!title || title.length < 2) return null;
    const bySearch = await this.query<{ Media?: RawMedia | null }>(
      `query($search:String){ Media(search:$search,type:ANIME,sort:SEARCH_MATCH){ ${MEDIA_FIELDS} } }`,
      { search: title },
    );
    return bySearch?.Media ? toMedia(bySearch.Media) : null;
  }

  /** One title by AniList's own id — what trace.moe hands back. */
  async getById(anilistId: number): Promise<AniListMedia | null> {
    const result = await this.query<{ Media?: RawMedia | null }>(
      `query($id:Int){ Media(id:$id,type:ANIME){ ${MEDIA_FIELDS} } }`,
      { id: anilistId },
    );
    return result?.Media ? toMedia(result.Media) : null;
  }

  /**
   * AniList's own trending ranking — one request for a whole batch, each
   * entry already carrying its artwork, so a homepage rail costs exactly one
   * round trip rather than one per title.
   */
  async getTrending(perPage = 50): Promise<AniListTrendingEntry[]> {
    const result = await this.query<{ Page?: { media?: RawMedia[] } }>(
      `query($perPage:Int){
        Page(page:1,perPage:$perPage){
          media(type:ANIME,sort:TRENDING_DESC){
            idMal
            trending
            coverImage { extraLarge large color }
            bannerImage
          }
        }
      }`,
      { perPage },
    );
    return (result?.Page?.media ?? [])
      .filter((m): m is RawMedia & { idMal: number } => typeof m.idMal === "number")
      .map((m) => ({
        idMal: m.idMal,
        trending: m.trending ?? 0,
        artwork: toArtwork(m),
      }));
  }

  // -- internals ---------------------------------------------------------

  /**
   * Serialised through one promise chain with a minimum gap, rather than
   * fired in parallel. AniList answers a burst with 429s for the following
   * minute, which in practice meant a background heal pass could lock out the
   * live requests happening alongside it.
   */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      return task();
    });
    // The chain must survive a rejected task, or one failure would stall
    // every request queued behind it.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private query<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
    return this.schedule(async () => {
      try {
        const response = await this.fetchImpl(this.baseUrl, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status === 429) {
          // Honour the server's own backoff rather than guessing one, and
          // push the next slot out past it.
          const retryAfter = Number(response.headers.get("retry-after") ?? "1");
          this.lastRequestAt =
            Date.now() + (Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000);
          return null;
        }
        if (!response.ok) return null;
        const body = (await response.json().catch(() => null)) as { data?: T } | null;
        return body?.data ?? null;
      } catch {
        // Artwork and airing dates are enrichment — never a reason to fail
        // the request that asked for them.
        return null;
      }
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArtwork(raw: RawMedia): AniListArtwork {
  const cover = raw.coverImage;
  return {
    cover: realArt(cover?.extraLarge) ?? realArt(cover?.large),
    banner: realArt(raw.bannerImage),
    color: cover?.color ?? null,
  };
}

function toMedia(raw: RawMedia): AniListMedia {
  return {
    id: raw.id ?? 0,
    idMal: raw.idMal ?? null,
    artwork: toArtwork(raw),
    nextEpisode: raw.nextAiringEpisode
      ? {
          episode: raw.nextAiringEpisode.episode,
          // Unix seconds on the wire; ISO everywhere inside the app.
          airingAt: new Date(raw.nextAiringEpisode.airingAt * 1000).toISOString(),
        }
      : null,
    tags: (raw.tags ?? [])
      // Spoiler tags are exactly the ones that must never reach a synopsis
      // panel, and a low rank means the voters disagreed it applies at all.
      .filter((t) => !t.isGeneralSpoiler && !t.isMediaSpoiler && (t.rank ?? 0) >= 60)
      .map((t) => ({ name: t.name ?? "", rank: t.rank ?? 0 }))
      .filter((t) => t.name.length > 0)
      .sort((a, b) => b.rank - a.rank),
    streamingLinks: (raw.externalLinks ?? [])
      .filter((l) => l.type === "STREAMING" && l.url && l.site)
      .map((l) => ({
        site: l.site as string,
        url: l.url as string,
        language: l.language ?? null,
      })),
  };
}
