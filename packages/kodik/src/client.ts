import type {
  KodikGenre,
  KodikGroup,
  KodikListParams,
  KodikResponse,
  KodikResult,
  KodikSearchParams,
} from "./types.js";

export interface KodikClientOptions {
  token?: string;
  baseUrl?: string;
  minIntervalMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class KodikError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "KodikError";
  }
}

const DEFAULTS = {
  // Community stable token (decoded from YaNesyTortiK/AnimeParsers kdk_tokns).
  // Override with your own from https://kodik.cc via KODIK_API_TOKEN.
  token: "56a768d08f43091901c44b54fe970049",
  baseUrl: "https://kodik-api.com",
  minIntervalMs: 250,
  maxRetries: 3,
  timeoutMs: 12_000,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A small, deep wrapper over the Kodik REST API. Behind a handful of
 * intent-named methods: a single-flight rate limiter, retry-with-backoff,
 * timeouts, and grouping of the per-translation rows Kodik returns into one
 * entry per anime.
 */
export class KodikClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: KodikClientOptions = {}) {
    this.token = options.token || DEFAULTS.token;
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /** All Kodik rows for a MyAnimeList / Shikimori id, grouped into one anime. */
  async getByShikimoriId(shikimoriId: number): Promise<KodikGroup | null> {
    const { results } = await this.post<KodikResponse<KodikResult>>("/search", {
      shikimori_id: shikimoriId,
      with_material_data: true,
      with_episodes: true,
      limit: 100,
    });
    const groups = groupByShikimori(results);
    return groups.get(shikimoriId) ?? null;
  }

  async searchByTitle(
    title: string,
    params: KodikSearchParams = {},
  ): Promise<KodikGroup[]> {
    const { results } = await this.post<KodikResponse<KodikResult>>("/search", {
      title,
      types: params.types ?? "anime,anime-serial",
      with_material_data: true,
      limit: params.limit ?? 40,
      ...serialiseListParams(params),
    });
    return [...groupByShikimori(results).values()];
  }

  /** A page of the catalogue. Returns groups plus the next-page cursor. */
  async list(
    params: KodikListParams = {},
    cursorUrl?: string,
  ): Promise<{ groups: KodikGroup[]; total: number; nextCursor: string | null }> {
    const response = cursorUrl
      ? await this.get<KodikResponse<KodikResult>>(cursorUrl)
      : await this.post<KodikResponse<KodikResult>>("/list", {
          types: params.types ?? "anime,anime-serial",
          with_material_data: true,
          limit: params.limit ?? 30,
          ...serialiseListParams(params),
        });

    return {
      groups: [...groupByShikimori(response.results).values()],
      total: response.total,
      nextCursor: response.next_page ?? null,
    };
  }

  async genres(): Promise<KodikGenre[]> {
    const { results } = await this.post<KodikResponse<KodikGenre>>("/genres", {
      genres_type: "all",
    });
    return results;
  }

  // -- internals ----------------------------------------------------------

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    url.searchParams.set("token", this.token);
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return this.execute<T>(url.toString(), "POST");
  }

  private get<T>(rawUrl: string): Promise<T> {
    const url = new URL(rawUrl);
    url.searchParams.set("token", this.token);
    return this.execute<T>(url.toString(), "GET");
  }

  private execute<T>(url: string, method: "GET" | "POST"): Promise<T> {
    const run = () => this.attempt<T>(url, method);
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async attempt<T>(url: string, method: "GET" | "POST"): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (cause) {
        if (attempt < this.maxRetries) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new KodikError(`Kodik request failed: ${(cause as Error).message}`, 503);
      }

      if (response.ok) {
        const data = (await response.json()) as T & { error?: string };
        if (data && typeof data === "object" && "error" in data && data.error) {
          throw new KodikError(String(data.error), 400);
        }
        return data;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        await sleep(600 * 2 ** attempt);
        continue;
      }
      throw new KodikError(`Kodik responded ${response.status}`, response.status);
    }
  }
}

function serialiseListParams(params: KodikListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (params.sort) out.sort = params.sort;
  if (params.order) out.order = params.order;
  if (params.anime_status) out.anime_status = params.anime_status;
  if (params.anime_kind) out.anime_kind = params.anime_kind;
  if (params.genres) out.genres = params.genres;
  if (params.anime_genres) out.anime_genres = params.anime_genres;
  if (params.year) out.year = params.year;
  if (params.shikimori_rating) out.shikimori_rating = params.shikimori_rating;
  if (params.not_blocked_in) out.not_blocked_in = params.not_blocked_in;
  return out;
}

/** Kodik returns one row per translation. Fold them into one entry per anime. */
export function groupByShikimori(results: KodikResult[]): Map<number, KodikGroup> {
  const groups = new Map<number, KodikGroup>();
  for (const result of results) {
    const id =
      typeof result.shikimori_id === "string"
        ? Number.parseInt(result.shikimori_id, 10)
        : (result.shikimori_id ?? NaN);
    if (!Number.isInteger(id) || id <= 0) continue;

    const existing = groups.get(id);
    if (!existing) {
      groups.set(id, { shikimoriId: id, primary: result, translations: [result] });
      continue;
    }
    existing.translations.push(result);
    if (score(result) > score(existing.primary)) existing.primary = result;
  }
  return groups;
}

function score(result: KodikResult): number {
  const md = result.material_data ? 1000 : 0;
  return md + (result.episodes_count ?? result.last_episode ?? 0);
}
