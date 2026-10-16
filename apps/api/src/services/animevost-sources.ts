import type { PrismaClient } from "@animeshadow/db";
import type { WatchSource } from "@animeshadow/shared";
import { z } from "zod";
import { TtlCache } from "../lib/cache.js";

const entrySchema = z.object({ id: z.number().int().positive(), title: z.string(), year: z.string(), type: z.string() });
const playlistSchema = z.array(z.object({ name: z.string(), std: z.string().optional(), preview: z.string().optional() })).max(3000);
export type VostIdentity = { title: string; titleEnglish: string | null; titleLocalized: string | null; year: number | null; type: string };
const normal = (name: string) => name.toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
const formatMatches = (type: string, provider: string) => {
  if (["TV", "TV_SPECIAL"].includes(type)) return provider === "ТВ";
  if (type === "MOVIE") return /фильм/i.test(provider);
  if (type === "SPECIAL") return /^(special|спешл|специальный выпуск)$/i.test(provider);
  return ["OVA", "ONA"].includes(type) && provider.toUpperCase() === type;
};

/** The API has no MAL field: accept only one exact name + year + format match. */
export function matchAnimeVost(entries: z.infer<typeof entrySchema>[], anime: VostIdentity): number | null {
  if (!anime.year || !anime.type || anime.type === "UNKNOWN") return null;
  const names = new Set([anime.title, anime.titleEnglish, anime.titleLocalized].filter((t): t is string => Boolean(t)).map(normal));
  const hits = entries.filter((entry) => Number(entry.year) === anime.year && formatMatches(anime.type, entry.type) &&
    entry.title.replace(/\s*\[[^\]]*\]\s*$/u, "").split(" / ").some((title) => names.has(normal(title))));
  return hits.length === 1 ? hits[0]!.id : null;
}

function mediaUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    // The API still publishes http links; use the CDN's verified TLS endpoint.
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && url.hostname === "video.animetop.info" && !url.port && !url.username && !url.password &&
      /^\/(?:720\/)?\d+\.mp4$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export class AnimeVostSources {
  private readonly cache = new TtlCache<WatchSource[]>(15 * 60_000, 1024);
  constructor(private readonly prisma: PrismaClient, private readonly log: { warn: (data: unknown, message?: string) => void },
    private readonly fetchImpl: typeof fetch = fetch) {}
  invalidate(id: number) { this.cache.delete(String(id)); }
  pending(id: number) { return this.cache.get(String(id)) === undefined; }

  getSources(malId: number): Promise<WatchSource[]> {
    return this.cache.wrap(String(malId), async () => {
      try {
        const anime = await this.prisma.anime.findUnique({ where: { id: malId }, select: { title: true, titleEnglish: true, titleLocalized: true, year: true, type: true } });
        if (!anime || !anime.year) return [];
        const deadline = AbortSignal.timeout(5000);
        const call = async (path: string, input: Record<string, string>) => {
          const response = await this.fetchImpl(`https://api.animevost.org/v1/${path}`, {
            method: "POST", body: new URLSearchParams(input), signal: deadline, redirect: "error",
            headers: { "user-agent": "AnimeShadow/1.0", accept: "application/json" },
          });
          if (!response.ok) throw new Error(`AnimeVost HTTP ${response.status}`);
          const body = await response.text();
          if (body.length > 3_000_000) throw new Error("AnimeVost response too large");
          return JSON.parse(body) as unknown;
        };
        const name = anime.titleEnglish || anime.title;
        const search = z.object({ data: z.array(entrySchema) }).parse(await call("search", { name }));
        let id = matchAnimeVost(search.data, anime);
        const alternate = anime.titleLocalized || anime.title;
        if (id == null && alternate !== name) {
          const retry = z.object({ data: z.array(entrySchema) }).parse(await call("search", { name: alternate }));
          id = matchAnimeVost(retry.data, anime);
        }
        if (id == null) return [];
        const playlist = playlistSchema.parse(await call("playlist", { id: String(id) }));
        const mediaEpisodes: Record<string, string> = {};
        const episodeMeta: NonNullable<WatchSource["episodeMeta"]> = {};
        for (const entry of playlist) {
          const n = /^(\d+)\s*(?:серия|эпизод)/i.exec(entry.name)?.[1] ?? (playlist.length === 1 && /^(фильм|ова|ona|ova)$/i.test(entry.name.trim()) ? "1" : null);
          const url = mediaUrl(entry.std);
          if (!n || Number(n) < 1 || !url || mediaEpisodes[n]) continue;
          mediaEpisodes[n] = url;
          if (entry.preview && /^https?:\/\/media\.animetop\.info\/img\/\d+\.jpg$/.test(entry.preview)) episodeMeta[n] = { thumb: entry.preview.replace(/^http:/, "https:") };
        }
        const first = Object.values(mediaEpisodes)[0];
        if (!first) return [];
        const probe = await this.fetchImpl(first, { headers: { Range: "bytes=0-1023" }, signal: deadline, redirect: "error" });
        void probe.body?.cancel();
        if (!probe.ok || !probe.headers.get("content-type")?.startsWith("video/")) return [];
        return [{ id: `animevost:${id}`, title: "AnimeVost", kind: "voice", format: "mp4", embedUrl: "", mediaEpisodes, episodeMeta,
          episodesCount: Object.keys(mediaEpisodes).length, quality: null, stable: true }];
      } catch { this.log.warn({ malId }, "AnimeVost API unavailable or ambiguous"); return []; }
    });
  }
}
