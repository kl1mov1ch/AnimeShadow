import type {
  ShikiAnimeFull,
  ShikiAnimeShort,
  ShikiCharacterSearch,
  ShikiGenre,
  ShikiListParams,
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

  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: ShikimoriClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.userAgent = options.userAgent ?? DEFAULTS.userAgent;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
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
    image?: { original?: string | null; preview?: string | null } | null;
    description?: string | null;
    animes?: ShikiAnimeShort[];
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
    const run = () => this.attempt<T>(url.toString());
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
    // Safe by default: nothing in this app ever wants hentai/uncensored
    // results, so a caller has to opt out explicitly rather than remembering
    // to opt in every time a new listing call gets added.
    censored: String(params.censored ?? true),
  };
}
