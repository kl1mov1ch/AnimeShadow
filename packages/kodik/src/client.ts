import type {
  KodikGenre,
  KodikGroup,
  KodikListParams,
  KodikResponse,
  KodikResult,
  KodikSearchParams,
} from "./types.js";
import { KODIK_EPISODE_IDENTITIES } from "./episode-identities.js";

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
      // `with_episodes_data`, not `with_episodes`: the plain flag returns a
      // bare link per episode, this one returns the link *and* the stills
      // the provider publishes for that episode. Both are wanted — the link
      // is what our own episode buttons load, the stills are what the
      // episode cards show.
      with_episodes_data: true,
      limit: 100,
    });
    const groups = groupByShikimori(results);
    const exact = groups.get(shikimoriId);
    if (exact) return exact;
    const identity = KODIK_EPISODE_IDENTITIES[shikimoriId];
    if (!identity) return null;
    const parent = await this.getByShikimoriId(identity.parentId);
    if (!parent) return null;
    const translations = parent.translations.flatMap(row => {
      const episodes = row.seasons?.[identity.season]?.episodes;
      // A complete, explicit set is required; never fall back to the series URL.
      if (!episodes || !identity.episodes.every(key => {
        const entry = episodes[key];
        return typeof entry === "string" ? Boolean(entry) : Boolean(entry?.link);
      })) return [];
      const mapped = Object.fromEntries(identity.episodes.map((key, index) => [String(index + 1), episodes[key]!]));
      const first = mapped["1"]!;
      return [{ ...row, shikimori_id: shikimoriId, kinopoisk_id: null,
        link: typeof first === "string" ? first : first.link!,
        episodes_count: identity.episodes.length, last_episode: identity.episodes.length,
        seasons: { "1": { episodes: mapped } } }];
    });
    return translations[0] ? { shikimoriId, primary: translations[0], translations } : null;
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

  /**
   * The fallback when a title has no Kodik row under its Shikimori id (fresh
   * releases are often added before anyone fills that id in): search by each
   * name, keep only rows of the same year (±1) whose own Shikimori id is
   * empty or the same, and group them as this title.
   */
  async findByTitles(shikimoriId: number, titles: string[], year: number | null): Promise<KodikGroup | null> {
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const wanted = new Set(titles.map(norm).filter((t) => t.length >= 3));
    for (const title of titles) {
      const { results } = await this.post<KodikResponse<KodikResult>>("/search", {
        title,
        types: "anime,anime-serial",
        with_material_data: true,
        with_episodes_data: true,
        limit: 50,
      });
      const rows = results.filter((r) => {
        const sid = Number(r.shikimori_id);
        if (Number.isInteger(sid) && sid > 0 && sid !== shikimoriId) return false;
        if (year != null && r.year != null && Math.abs(r.year - year) > 1) return false;
        const names = [r.title, r.title_orig, r.other_title].map(norm);
        // A partial name is not an identity: it can be another season or an OVA.
        // Explicit matching IDs are authoritative; unlinked rows need an exact alias.
        return sid === shikimoriId || names.some((n) => n.length >= 3 && wanted.has(n));
      });
      if (rows.length === 0) continue;
      let primary = rows[0]!;
      for (const r of rows) if (score(r) > score(primary)) primary = r;
      return { shikimoriId, primary, translations: rows };
    }
    return null;
  }

  /** A page of the catalogue. Returns groups plus the next-page cursor. */
  async listByTranslation(translationId: number, cursorUrl?: string): Promise<{ rows: KodikResult[]; total: number; nextCursor: string | null }> {
    if (!Number.isSafeInteger(translationId) || translationId <= 0) throw new Error("Invalid translation id");
    const response = cursorUrl
      ? await this.get<KodikResponse<KodikResult>>(cursorUrl)
      : await this.post<KodikResponse<KodikResult>>("/list", {
        translation_id: translationId, with_material_data: true, with_episodes_data: true,
        sort: "updated_at", order: "desc", limit: 100,
      });
    return { rows: response.results.filter((row) => row.translation.id === translationId), total: response.total, nextCursor: response.next_page ?? null };
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
  if (params.has_field) out.has_field = params.has_field;
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
