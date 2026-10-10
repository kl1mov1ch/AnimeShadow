import type {
  ShikiAnimeFull,
  ShikiAnimeShort,
  ShikiCharacterSearch,
  ShikiFranchise,
  ShikiGenre,
  ShikiListParams,
  ShikiMangaShort,
  ShikiRole,
} from "./types.js";

export interface ShikimoriClientOptions {
  baseUrl?: string;
  userAgent?: string;
  /** Shikimori allows ~5 req/s, 90 req/min. */
  minIntervalMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * Whether the call being made right now can wait — upkeep rather than a
   * visitor's request. Those queue behind everything else; see `get`.
   */
  isBackground?: () => boolean;
}

interface QueuedRequest {
  url: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class ShikimoriError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ShikimoriError";
  }
}

const DEFAULTS = {
  baseUrl: "https://shikimori.io",
  userAgent: "AnimeShadow/1.0 (anime catalogue)",
  minIntervalMs: 260,
  maxRetries: 3,
  timeoutMs: 12_000,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A small, deep wrapper over the Shikimori REST API — the app's primary,
 * Russian-native metadata source. Handles the required descriptive User-Agent,
 * a single-flight rate limiter, retry-with-backoff, and timeouts.
 */
export class ShikimoriClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  private readonly isBackground: () => boolean;
  /** Visitors' requests, then upkeep: one in flight at a time, either way. */
  private readonly lanes: { now: QueuedRequest[]; later: QueuedRequest[] } = { now: [], later: [] };
  private pumping = false;
  private lastRequestAt = 0;

  constructor(options: ShikimoriClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.userAgent = options.userAgent ?? DEFAULTS.userAgent;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.isBackground = options.isBackground ?? (() => false);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  getAnime(id: number): Promise<ShikiAnimeFull> {
    return this.get<ShikiAnimeFull>(`/api/animes/${id}`);
  }

  listAnimes(params: ShikiListParams = {}): Promise<ShikiAnimeShort[]> {
    return this.get<ShikiAnimeShort[]>("/api/animes", serialiseList(params));
  }

  getRoles(id: number): Promise<ShikiRole[]> {
    return this.get<ShikiRole[]>(`/api/animes/${id}/roles`);
  }

  getScreenshots(id: number): Promise<Array<{ original: string; preview: string }>> {
    return this.get(`/api/animes/${id}/screenshots`);
  }

  /** Every title (seasons, movies, spin-offs, OVAs) sharing this one's continuity. */
  getFranchise(id: number): Promise<ShikiFranchise> {
    return this.get(`/api/animes/${id}/franchise`);
  }

  getGenres(): Promise<ShikiGenre[]> {
    return this.get<ShikiGenre[]>("/api/genres", { entry_type: "Anime" });
  }

  searchCharacters(query: string): Promise<ShikiCharacterSearch[]> {
    return this.get<ShikiCharacterSearch[]>("/api/characters/search", {
      search: query,
    });
  }

  getCharacter(id: number): Promise<{
    id: number;
    name: string;
    russian: string | null;
    japanese?: string | null;
    /** Comma-separated aliases, e.g. "Zero, Lulu, Black Prince". */
    altname?: string | null;
    image?: { original?: string | null; preview?: string | null } | null;
    description?: string | null;
    /** Voice actors — the original Japanese cast comes first. */
    seyu?: Array<{
      id: number;
      name: string;
      russian?: string | null;
      image?: { original?: string | null; preview?: string | null } | null;
    }>;
    animes?: ShikiAnimeShort[];
    mangas?: ShikiMangaShort[];
  }> {
    return this.get(`/api/characters/${id}`);
  }

  /** Absolute URL for a relative Shikimori image path. */
  imageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    if (path.includes("missing")) return null;
    return `${this.baseUrl}${path}`;
  }

  /** Predictable poster URL by anime id (browser follows the redirect). */
  posterUrl(id: number, size: "original" | "x160" | "x96" = "original"): string {
    return `${this.baseUrl}/system/animes/${size}/${id}.jpg`;
  }

  // -- internals ---------------------------------------------------------

  private get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    // Still strictly one request at a time, spaced by minIntervalMs — the
    // rate limit is per client, not per lane. What the lanes change is the
    // order: a visitor's request goes ahead of any upkeep still waiting, so
    // it waits at most for the one call already in flight.
    return new Promise<T>((resolve, reject) => {
      const lane = this.isBackground() ? this.lanes.later : this.lanes.now;
      lane.push({ url: url.toString(), resolve: resolve as (value: unknown) => void, reject });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const next = this.lanes.now.shift() ?? this.lanes.later.shift();
        if (!next) break;
        try {
          next.resolve(await this.attempt(next.url));
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private async attempt<T>(url: string): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { accept: "application/json", "user-agent": this.userAgent },
          redirect: "follow",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (cause) {
        if (attempt < this.maxRetries) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new ShikimoriError(
          `Shikimori request failed: ${(cause as Error).message}`,
          503,
        );
      }

      if (response.ok) return (await response.json()) as T;

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 700 * 2 ** attempt,
        );
        continue;
      }
      throw new ShikimoriError(`Shikimori responded ${response.status}`, response.status);
    }
  }
}

function serialiseList(params: ShikiListParams): Record<string, unknown> {
  return {
    page: params.page,
    limit: params.limit,
    order: params.order,
    kind: params.kind,
    status: params.status,
    season: params.season,
    score: params.score,
    genre: params.genre,
    studio: params.studio,
    franchise: params.franchise,
    search: params.search,
    ids: params.ids,
    rating: params.rating,
    // Safe by default: nothing in this app ever wants hentai/uncensored
    // results, so a caller has to opt out explicitly rather than remembering
    // to opt in every time a new listing call gets added.
    censored: String(params.censored ?? true),
  };
}
