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
    iframe?: string;
    quality?: string;
    translation_iframe?: Record<string, { iframe?: string; name?: string }>;
    translation?: Record<string, string> | Array<{ id: number; name: string }>;
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
    const url = new URL(this.baseUrl + "/");
    url.searchParams.set("token", this.token);
    url.searchParams.set("kp", String(kinopoiskId));

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    const body = (await response.json().catch(() => null)) as AllohaResponse | null;
    if (!body || body.status !== "success" || !body.data?.iframe) return null;

    const translationIframes: Record<string, string> = {};
    for (const [id, entry] of Object.entries(body.data.translation_iframe ?? {})) {
      if (entry?.iframe) translationIframes[id] = withScheme(entry.iframe);
    }

    const translations: Array<{ id: string; name: string }> = [];
    const raw = body.data.translation;
    if (Array.isArray(raw)) {
      for (const t of raw) translations.push({ id: String(t.id), name: t.name });
    } else if (raw) {
      for (const [id, name] of Object.entries(raw)) {
        translations.push({ id, name: String(name) });
      }
    }

    return {
      iframe: withScheme(body.data.iframe),
      translationIframes,
      translations,
      quality: body.data.quality ?? null,
    };
  }
}

function withScheme(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}
