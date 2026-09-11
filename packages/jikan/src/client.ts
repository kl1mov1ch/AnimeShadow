import type {
  JikanAnime,
  JikanCharacterEntry,
  JikanCharacterSearchEntry,
  JikanGenre,
  JikanList,
  JikanRecommendationEntry,
  JikanSearchParams,
} from "./types.js";

export interface JikanClientOptions {
  baseUrl?: string;
  /** Minimum gap between outgoing requests. Jikan allows ~3 req/s. */
  minIntervalMs?: number;
  /** Retries for 429 / 5xx / network errors. */
  maxRetries?: number;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export class JikanError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "JikanError";
  }
}

const DEFAULTS = {
  baseUrl: "https://api.jikan.moe/v4",
  minIntervalMs: 380,
  maxRetries: 3,
  timeoutMs: 12_000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A small, deep wrapper over the Jikan REST API.
 *
 * The interface is a handful of intent-named methods returning raw Jikan
 * payloads. Hidden behind it: a single-flight rate limiter that serialises
 * every request with a fixed minimum gap, retry-with-backoff that honours
 * `Retry-After`, request timeouts, and query-string assembly. Callers never
 * see any of that.
 */
export class JikanClient {
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  /** Tail of the request queue — every call chains onto this promise. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: JikanClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  getAnimeById(id: number): Promise<JikanAnime> {
    return this.get<{ data: JikanAnime }>(`/anime/${id}/full`).then((r) => r.data);
  }

  /**
   * Poster URLs for a MAL id. Used as a fallback when the primary catalogue
   * source has no artwork (common for newly announced / airing titles).
   * Returns null when MAL has no entry for the id.
   */
  async getAnimePoster(
    id: number,
  ): Promise<{ small: string | null; large: string | null } | null> {
    try {
      const anime = await this.get<{ data: JikanAnime }>(`/anime/${id}`).then(
        (r) => r.data,
      );
      const set = anime.images?.webp ?? anime.images?.jpg;
      const large = set?.large_image_url ?? set?.image_url ?? null;
      const small = set?.image_url ?? set?.small_image_url ?? large;
      return large || small ? { small, large } : null;
    } catch (error) {
      if (error instanceof JikanError && error.status === 404) return null;
      throw error;
    }
  }

  getAnimeCharacters(id: number): Promise<JikanCharacterEntry[]> {
    return this.get<{ data: JikanCharacterEntry[] }>(`/anime/${id}/characters`).then(
      (r) => r.data,
    );
  }

  getAnimeRecommendations(id: number): Promise<JikanRecommendationEntry[]> {
    return this.get<{ data: JikanRecommendationEntry[] }>(
      `/anime/${id}/recommendations`,
    ).then((r) => r.data);
  }

  searchAnime(params: JikanSearchParams): Promise<JikanList<JikanAnime>> {
    return this.get<JikanList<JikanAnime>>("/anime", params);
  }

  searchCharacters(
    params: { q: string; limit?: number; order_by?: string; sort?: "asc" | "desc" },
  ): Promise<JikanList<JikanCharacterSearchEntry>> {
    return this.get<JikanList<JikanCharacterSearchEntry>>("/characters", {
      order_by: "favorites",
      sort: "desc",
      ...params,
    });
  }

  getTopAnime(
    params: { type?: string; filter?: "airing" | "upcoming" | "bypopularity" | "favorite"; page?: number; limit?: number } = {},
  ): Promise<JikanList<JikanAnime>> {
    return this.get<JikanList<JikanAnime>>("/top/anime", params);
  }

  getSeasonNow(params: { page?: number; limit?: number; sfw?: boolean } = {}): Promise<
    JikanList<JikanAnime>
  > {
    return this.get<JikanList<JikanAnime>>("/seasons/now", params);
  }

  getSeason(
    year: number,
    season: string,
    params: { page?: number; limit?: number; sfw?: boolean } = {},
  ): Promise<JikanList<JikanAnime>> {
    return this.get<JikanList<JikanAnime>>(`/seasons/${year}/${season}`, params);
  }

  getGenres(): Promise<JikanGenre[]> {
    return this.get<{ data: JikanGenre[] }>("/genres/anime").then((r) => r.data);
  }

  // -- internals ------------------------------------------------------------

  private get<T>(path: string, query?: object): Promise<T> {
    const run = () => this.execute<T>(path, query);
    // Serialise: park this request behind whatever is already queued.
    const result = this.queue.then(run, run);
    // Keep the queue alive regardless of individual outcomes.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async execute<T>(path: string, query?: object): Promise<T> {
    const url = this.buildUrl(path, query);

    for (let attempt = 0; ; attempt += 1) {
      await this.respectRateLimit();

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (cause) {
        if (attempt < this.maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new JikanError(
          `Jikan request failed: ${(cause as Error).message}`,
          503,
          true,
        );
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      const retriable = response.status === 429 || response.status >= 500;
      if (retriable && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoffMs(attempt),
        );
        continue;
      }

      throw new JikanError(
        `Jikan responded ${response.status} for ${path}`,
        response.status,
        retriable,
      );
    }
  }

  private async respectRateLimit(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private buildUrl(path: string, query?: object): string {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {}) as [string, unknown][]) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

function backoffMs(attempt: number): number {
  // 0.6s, 1.4s, 3s (+ up to 250ms jitter)
  return Math.round((0.6 * 2 ** attempt + 0.2) * 1000 + Math.random() * 250);
}
