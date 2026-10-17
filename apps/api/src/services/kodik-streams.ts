import { createRequire } from "node:module";
import type { WatchSource } from "@animeshadow/shared";
import type * as KodikWrapper from "kodikwrapper";
import { TtlCache } from "../lib/cache.js";

// The installed package's ESM build imports a directory. Its CJS build works
// on Node 20/22/24 and exposes the identical typed API.
const { VideoLinks } = createRequire(import.meta.url)(
  "kodikwrapper",
) as typeof KodikWrapper;

export interface KodikStreamsResult {
  variants: Record<string, string>;
}

/** Only metadata is stored in Postgres. Signed CDN links live briefly in memory. */
export class KodikStreams {
  private active = 0;
  private cache = new TtlCache<KodikStreamsResult>(2 * 60_000, 1024);
  private readonly endpoints = new TtlCache<string>(60 * 60_000, 20);

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  invalidate(): void {
    this.cache = new TtlCache<KodikStreamsResult>(2 * 60_000, 1024);
  }

  async resolve(link: string): Promise<KodikStreamsResult> {
    return this.cache.wrap(link, async () => {
      if (this.active >= 8) throw new Error("Kodik resolver busy");
      this.active++;
      try {
        const origin = new URL(link).origin;
        const deadline = AbortSignal.timeout(18_000);
        // Only the provider host from a stored source is fetched. Discovered
        // script/endpoint URLs cannot turn this into an arbitrary URL proxy.
        const fetcher: typeof fetch = async (input, init) => {
          const url = new URL(String(input), origin);
          if (
            url.protocol !== "https:" ||
            url.origin !== origin ||
            url.username ||
            url.password
          ) {
            throw new Error("Unexpected Kodik endpoint");
          }
          const response = await this.fetchImpl(url, {
            ...init,
            signal: deadline,
            redirect: "error",
            headers: {
              ...Object.fromEntries(new Headers(init?.headers)),
              accept: "*/*",
            },
          });
          if (!response.ok) {
            void response.body?.cancel();
            throw new Error(`Kodik HTTP ${response.status}`);
          }
          return response;
        };
        const endpoint = await this.endpoints.wrap(origin, async () => {
          const parsed = await VideoLinks.parseLink({ link, extended: true, fetcher });
          if (!parsed.ex.playerSingleUrl)
            throw new Error("Kodik player script missing");
          const path = await VideoLinks.getActualVideoInfoEndpoint(
            new URL(parsed.ex.playerSingleUrl, origin).href,
            fetcher,
          );
          if (!/^\/[a-z0-9_-]+$/i.test(path)) throw new Error("Invalid Kodik endpoint");
          return path;
        });
        let links: Awaited<ReturnType<typeof VideoLinks.getLinks>>;
        try {
          links = await VideoLinks.getLinks({
            link,
            videoInfoEndpoint: endpoint,
            fetcher,
          });
        } catch (error) {
          // Provider rotates this path. The next attempt discovers the new one.
          this.endpoints.delete(origin);
          throw error;
        }
        const variants: Record<string, string> = {};
        for (const [height, files] of Object.entries(links)) {
          if (!/^\d{3,4}$/.test(height) || Number(height) > 4320) continue;
          for (const file of files) {
            if (!/mpegurl/i.test(file.type) && !/\.m3u8(?:\?|$)/i.test(file.src))
              continue;
            const url = new URL(file.src, origin);
            if (
              url.protocol !== "https:" ||
              url.username ||
              url.password ||
              /[\r\n]/.test(file.src)
            )
              continue;
            variants[height] = url.href;
            break;
          }
        }
        if (Object.keys(variants).length === 0)
          throw new Error("No playable Kodik HLS streams");
        return { variants };
      } finally {
        this.active--;
      }
    });
  }
}

/** Stable, same-origin episode addresses; resolving happens only on playback. */
export function kodikCustomSource(
  animeId: number,
  source: WatchSource,
): WatchSource | null {
  const translationId = source.id.replace(/^kodik:/, "");
  if (!/^\d+$/.test(translationId)) return null;
  const episodes = Object.keys(source.iframeEpisodes ?? {}).filter((key) =>
    /^[1-9]\d*$/.test(key),
  );
  if (
    episodes.length === 0 &&
    (source.episodesCount == null || source.episodesCount <= 1)
  )
    episodes.push("1");
  if (episodes.length === 0) return null;
  return {
    ...source,
    id: `kodik:${translationId}`,
    format: "hls",
    embedUrl: "",
    stable: null,
    providerPlayer: {
      url: source.embedUrl,
      episodes: Object.fromEntries(Object.entries(source.iframeEpisodes ?? {}).map(([n, e]) => [n, e.url])),
    },
    hlsEpisodes: Object.fromEntries(
      episodes.map((episode) => [
        episode,
        `/api/anime/${animeId}/streams/kodik/${translationId}/${episode}/master.m3u8`,
      ]),
    ),
    hlsVariants: undefined,
    iframeEpisodes: undefined,
  };
}

export function kodikMasterPlaylist(variants: Record<string, string>): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];
  for (const height of Object.keys(variants)
    .map(Number)
    .sort((a, b) => a - b)) {
    const bandwidth = Math.max(300_000, Math.round(height * height * 7));
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${Math.round((height * 16) / 9 / 2) * 2}x${height}`,
      variants[String(height)]!,
    );
  }
  return `${lines.join("\n")}\n`;
}
