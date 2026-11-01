// Alloha — a Russian video aggregator. One request by Kinopoisk id returns a
// ready iframe URL (its own player over Kodik / other sources) plus per-dub
// iframes. No user token needed — a public webmaster token is baked in, the
// same approach every Shikimori player extension uses.

export interface AllohaClientOptions {
  token?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface AllohaResult {
  kinopoiskId?: number;
  /** Aggregated iframe (Alloha's own player). */
  iframe: string;
  /** Per-translation iframes, keyed by translation id. */
  translationIframes: Record<string, string>;
  translations: Array<{ id: string; name: string }>;
  quality: string | null;
}

const DEFAULTS = {
  token: "45e20a5f584becf7a64dffb7174ddf",
  baseUrl: "https://api.alloha.tv",
  timeoutMs: 10_000,
};

interface AllohaResponse {
  status: string;
  data?: {
    name?: string;
    original_name?: string;
    alternative_name?: string;
    year?: number | string;
    category?: number;
    id_kp?: number | string;
    iframe?: string;
    quality?: string;
    translation_iframe?: Record<string, { iframe?: string; name?: string }>;
    translation?: string | Record<string, string> | Array<{ id: number; name: string }>;
  };
}

export class AllohaClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AllohaClientOptions = {}) {
    this.token = options.token || DEFAULTS.token;
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async getByKinopoiskId(kinopoiskId: number): Promise<AllohaResult | null> {
    const data = await this.lookup("kp", String(kinopoiskId));
    return data ? toResult(data) : null;
  }

  /** Independent lookup for titles Kodik does not have. Reject another season. */
  async findByTitles(
    titles: string[],
    year: number,
    type: string,
  ): Promise<AllohaResult | null> {
    const names = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, 3);
    const normalized = new Set(names.map(normalizeTitle));
    const rows = await Promise.all(names.map((name) => this.lookup("name", name)));
    const matches = rows.filter((data): data is NonNullable<AllohaResponse["data"]> =>
      Boolean(
        data &&
        Number(data.year) === year &&
        data.category === (type === "MOVIE" ? 3 : 4) &&
        [data.name, data.original_name, data.alternative_name].some(
          (name) => name && normalized.has(normalizeTitle(name)),
        ),
      ),
    );
    if (
      !matches.length ||
      new Set(matches.map((data) => String(data.id_kp ?? data.iframe))).size !== 1
    )
      return null;
    return toResult(matches[0]!);
  }

  private async lookup(
    key: "kp" | "name",
    value: string,
  ): Promise<NonNullable<AllohaResponse["data"]> | null> {
    const url = new URL(this.baseUrl + "/");
    url.searchParams.set("token", this.token);
    url.searchParams.set(key, value);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      void response.body?.cancel();
      return null;
    }

    const body = (await response.json().catch(() => null)) as AllohaResponse | null;
    if (!body || body.status !== "success" || !body.data?.iframe) return null;
    return body.data;
  }
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function toResult(data: NonNullable<AllohaResponse["data"]>): AllohaResult {
  const translationIframes: Record<string, string> = {};
  for (const [id, entry] of Object.entries(data.translation_iframe ?? {})) {
    if (entry?.iframe) translationIframes[id] = withScheme(entry.iframe);
  }

  const translations: Array<{ id: string; name: string }> = [];
  const raw = data.translation;
  if (Array.isArray(raw)) {
    for (const t of raw) translations.push({ id: String(t.id), name: t.name });
  } else if (raw && typeof raw === "object") {
    for (const [id, name] of Object.entries(raw)) {
      translations.push({ id, name: String(name) });
    }
  }
  for (const [id, entry] of Object.entries(data.translation_iframe ?? {})) {
    if (entry.name && !translations.some((t) => t.id === id))
      translations.push({ id, name: entry.name });
  }

  return {
    ...(Number(data.id_kp) > 0 ? { kinopoiskId: Number(data.id_kp) } : {}),
    iframe: withScheme(data.iframe!),
    translationIframes,
    translations,
    quality: data.quality ?? null,
  };
}

function withScheme(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}
