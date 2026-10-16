import { z } from "zod";
import { watchSourceSchema, type WatchSource } from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";

const httpsUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Expected an HTTPS URL without credentials");

/** Server-configured feeds; no request parameter can choose an upstream URL. */
export const directProviderSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  urlTemplate: httpsUrl.refine((url) => url.includes("{malId}"), "Missing {malId}"),
  tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  streamHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/)).min(1).max(30),
});
export const directProvidersSchema = z.array(directProviderSchema).max(10)
  .refine((providers) => new Set(providers.map((provider) => provider.id)).size === providers.length, "Duplicate provider id");
export type DirectProvider = z.infer<typeof directProviderSchema>;

const episodeUrls = z.record(z.string().regex(/^[1-9]\d*$/), httpsUrl)
  .refine((episodes) => Object.keys(episodes).length > 0 && Object.keys(episodes).length <= 3000, "Expected 1–3000 episodes");
const feedSource = watchSourceSchema.extend({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  title: z.string().min(1).max(160),
  format: z.literal("hls"),
  embedUrl: z.literal("").default(""),
  hlsEpisodes: episodeUrls,
  hlsVariants: z.record(z.string().regex(/^[1-9]\d*$/), z.record(z.string().regex(/^\d{3,4}$/), httpsUrl)).optional(),
  quality: z.string().max(40).nullable().default(null),
  episodesCount: z.number().int().positive().nullable().default(null),
});
const feedSchema = z.object({
  malId: z.number().int().positive(),
  /** Feed credentials stay on the server; streams must be browser playable. */
  expiresAt: z.string().datetime().optional(),
  sources: z.array(feedSource).max(32),
});

export function parseDirectFeed(body: unknown, provider: DirectProvider, malId: number, now = Date.now()): { sources: WatchSource[]; expiresAt: number } {
  const feed = feedSchema.parse(body);
  if (feed.malId !== malId) throw new Error("Direct feed returned a different title");
  const expiresAt = Math.min(now + 60_000, feed.expiresAt ? Date.parse(feed.expiresAt) - 30_000 : Infinity);
  if (expiresAt <= now) return { sources: [], expiresAt };
  const ids = new Set<string>();
  const sources = feed.sources.map((source) => {
    if (ids.has(source.id)) throw new Error("Duplicate direct source id");
    ids.add(source.id);
    const urls = [...Object.values(source.hlsEpisodes), ...Object.values(source.hlsVariants ?? {}).flatMap(Object.values)];
    if (urls.some((url) => !provider.streamHosts.includes(new URL(url).hostname))) throw new Error("Unexpected stream host");
    return { ...source, id: `direct-${provider.id}:${source.id}`, stable: null };
  });
  return { sources, expiresAt };
}

/** Adapts any contracted provider's JSON feed into our existing HLS player. */
export class DirectSources {
  private readonly cache = new TtlCache<{ sources: WatchSource[]; expiresAt: number }>(60_000, 512);

  constructor(
    private readonly providers: DirectProvider[],
    private readonly logger: { warn: (obj: unknown, msg?: string) => void },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  invalidate(malId: number): void {
    for (const provider of this.providers) this.cache.delete(`${provider.id}:${malId}`);
  }

  async getSources(malId: number): Promise<WatchSource[]> {
    const results = await Promise.all(this.providers.map(async (provider) => {
      const key = `${provider.id}:${malId}`;
      const previous = this.cache.get(key);
      if (previous && previous.expiresAt <= Date.now()) this.cache.delete(key);
      try {
        const result = await this.cache.wrap(key, async () => {
          const token = provider.tokenEnv ? process.env[provider.tokenEnv] : undefined;
          if (provider.tokenEnv && !token) throw new Error("Missing provider credential");
          const response = await this.fetchImpl(provider.urlTemplate.replaceAll("{malId}", String(malId)), {
            headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            signal: AbortSignal.timeout(5_000),
            redirect: "error",
          });
          if (!response.ok || !response.body) {
            void response.body?.cancel();
            throw new Error("Direct feed unavailable");
          }
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 2_000_000) throw new Error("Direct feed too large");
              chunks.push(value);
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          return parseDirectFeed(JSON.parse(Buffer.concat(chunks).toString("utf8")), provider, malId);
        });
        return result.expiresAt > Date.now() ? result.sources : [];
      } catch {
        // URLs may contain signed tokens. Never log a fetch error or payload here.
        this.logger.warn({ provider: provider.id, malId }, "direct feed unavailable or invalid");
        return [];
      }
    }));
    return results.flat();
  }
}
