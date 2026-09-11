import type { Locale } from "@animeshadow/shared";

export interface Translator {
  /** Returns translated text, or null if translation was unavailable. */
  translate(text: string, from: Locale, to: Locale): Promise<string | null>;
}

/** No-op translator used when translation is disabled. */
export const identityTranslator: Translator = {
  async translate() {
    return null;
  },
};

/** Try each translator in order; first non-null wins. */
export function chainTranslators(translators: Translator[]): Translator {
  return {
    async translate(text, from, to) {
      for (const translator of translators) {
        const result = await translator.translate(text, from, to);
        if (result) return result;
      }
      return null;
    },
  };
}

/**
 * Google's unofficial `translate_a/single` endpoint — no key. Frequently the
 * only free option that works; may rate-limit an IP with a 429.
 */
export class GoogleTranslator implements Translator {
  private readonly fetchImpl: typeof fetch;
  private queue: Promise<unknown> = Promise.resolve();
  private lastAt = 0;

  constructor(options: { fetchImpl?: typeof fetch } = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async translate(text: string, from: Locale, to: Locale): Promise<string | null> {
    const trimmed = text.trim();
    if (!trimmed || from === to) return null;

    const run = async (): Promise<string | null> => {
      const wait = this.lastAt + 400 - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastAt = Date.now();

      const url = new URL("https://translate.googleapis.com/translate_a/single");
      url.searchParams.set("client", "gtx");
      url.searchParams.set("sl", from);
      url.searchParams.set("tl", to);
      url.searchParams.set("dt", "t");
      url.searchParams.set("q", trimmed.slice(0, 4800));

      try {
        const response = await this.fetchImpl(url, {
          headers: { "user-agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as unknown;
        if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
        const joined = (data[0] as unknown[])
          .map((segment) => (Array.isArray(segment) ? String(segment[0] ?? "") : ""))
          .join("");
        return joined.trim() || null;
      } catch {
        return null;
      }
    };

    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

const MAX_CHUNK = 480; // MyMemory rejects q longer than ~500 bytes
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MyMemoryOptions {
  email?: string | undefined;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Free translation via api.mymemory.translated.net — no API key. Requests are
 * serialised with a fixed gap; long text is split into sentence-ish chunks and
 * rejoined. Any failure (quota, network, bad status) yields null so the caller
 * can fall back to the source text.
 */
export class MyMemoryTranslator implements Translator {
  private readonly email?: string;
  private readonly minIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private queue: Promise<unknown> = Promise.resolve();
  private lastAt = 0;

  constructor(options: MyMemoryOptions = {}) {
    this.email = options.email;
    this.minIntervalMs = options.minIntervalMs ?? 1200;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async translate(text: string, from: Locale, to: Locale): Promise<string | null> {
    const trimmed = text.trim();
    if (!trimmed || from === to) return null;

    const chunks = splitIntoChunks(trimmed);
    const out: string[] = [];
    for (const chunk of chunks) {
      const translated = await this.enqueue(() => this.translateChunk(chunk, from, to));
      if (translated == null) return null;
      out.push(translated);
    }
    return out.join(" ").replace(/\s+([.,!?;:])/g, "$1").trim();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = () => task();
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async translateChunk(
    chunk: string,
    from: Locale,
    to: Locale,
  ): Promise<string | null> {
    const wait = this.lastAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastAt = Date.now();

    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", chunk);
    url.searchParams.set("langpair", `${from}|${to}`);
    if (this.email) url.searchParams.set("de", this.email);

    try {
      const response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        responseStatus?: number | string;
        responseData?: { translatedText?: string };
      };
      const status = Number(data.responseStatus);
      const value = data.responseData?.translatedText;
      if (status !== 200 || !value) return null;
      // MyMemory returns quota warnings as the "translation" itself.
      if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(value)) return null;
      return decodeEntities(value);
    } catch {
      return null;
    }
  }
}

function splitIntoChunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > MAX_CHUNK) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (const piece of hardWrap(sentence, MAX_CHUNK)) chunks.push(piece);
      continue;
    }
    if ((current + sentence).length > MAX_CHUNK) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

function hardWrap(text: string, limit: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > limit) {
      if (line) out.push(line.trim());
      line = word;
    } else {
      line += " " + word;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
