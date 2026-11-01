import { AnimeThemesClient, type AnimeOpening } from "@animeshadow/animethemes";
import { TtlCache } from "../lib/cache.js";
import { NotFoundError, UpstreamUnavailableError } from "../lib/errors.js";

export interface AnimeMusicTrack {
  id: string;
  title: string;
  artist: string | null;
  label: string;
  url: string;
  fallbackUrl: string | null;
  sourceUrl: string | null;
}

export function themeMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["a.animethemes.moe", "v.animethemes.moe"].includes(url.hostname) &&
      /\.(?:ogg|webm)(?:$)/.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** One exact MAL lookup, shared by the page and its audio requests. */
export class AnimeMusicService {
  private readonly cache = new TtlCache<AnimeOpening[]>(6 * 60 * 60_000, 1024);
  private readonly probes = new TtlCache<boolean>(2 * 60_000, 4096);
  constructor(
    private readonly client: Pick<
      AnimeThemesClient,
      "getThemes"
    > = new AnimeThemesClient(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private playable(url: string): Promise<boolean> {
    return this.probes.wrap(url, async () => {
      try {
        const response = await this.fetchImpl(url, {
          redirect: "error",
          signal: AbortSignal.timeout(4500),
          headers: { range: "bytes=0-1023" },
        });
        if (
          ![200, 206].includes(response.status) ||
          !/^(?:audio\/|video\/webm|application\/ogg)/.test(
            response.headers.get("content-type") ?? "",
          )
        ) {
          void response.body?.cancel();
          return false;
        }
        const reader = response.body?.getReader();
        if (!reader) return false;
        try {
          const value = new Uint8Array(4); let size = 0;
          while (size < value.length) {
            const chunk = await reader.read(); if (chunk.done) break;
            const part = chunk.value.subarray(0, value.length - size); value.set(part, size); size += part.length;
          }
          if (size < 4) return false;
          return (
            (value[0] === 79 &&
              value[1] === 103 &&
              value[2] === 103 &&
              value[3] === 83) ||
            (value[0] === 0x1a &&
              value[1] === 0x45 &&
              value[2] === 0xdf &&
              value[3] === 0xa3)
          );
        } finally {
          await reader.cancel().catch(() => {});
        }
      } catch {
        return false;
      }
    });
  }

  private getTracks(animeId: number) {
    return this.cache.wrap(String(animeId), async () => {
      const result = await this.client.getThemes(animeId);
      if (result.error && !/^HTTP 404\b/.test(result.error))
        throw new UpstreamUnavailableError(
          "Архив опенингов временно недоступен. Попробуйте чуть позже.",
        );
      return result.tracks
        .filter(
          (track) =>
            track.kind === "OP" &&
            (themeMediaUrl(track.audioUrl) || themeMediaUrl(track.url)),
        )
        .slice(0, 60);
    });
  }

  async list(animeId: number): Promise<{ source: string; items: AnimeMusicTrack[] }> {
    const tracks = await this.getTracks(animeId);
    const items: Array<AnimeMusicTrack | null> = new Array(tracks.length).fill(null);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, tracks.length) }, async () => {
        while (next < tracks.length) {
          const index = next++,
            track = tracks[index]!;
          const audio = themeMediaUrl(track.audioUrl),
            video = themeMediaUrl(track.url);
          const audioWorks = Boolean(audio && (await this.playable(audio)));
          if (!audioWorks && !(video && (await this.playable(video)))) continue;
          const base = `/api/anime/${animeId}/music/${index}`;
          items[index] = {
            id: `${animeId}:${track.slug}:${index}`,
            title: track.song || `Опенинг ${index + 1}`,
            artist: track.artist,
            label: track.slug,
            url: `${base}/${audioWorks ? "audio" : "video"}`,
            fallbackUrl: audioWorks && video ? `${base}/video` : null,
            sourceUrl: track.pageUrl?.startsWith("https://animethemes.moe/anime/")
              ? track.pageUrl
              : null,
          };
        }
      }),
    );
    return {
      source: "AnimeThemes",
      items: items.filter((track): track is AnimeMusicTrack => track != null),
    };
  }

  async media(animeId: number, index: number, format: "audio" | "video") {
    const track = (await this.getTracks(animeId))[index];
    const url = track && themeMediaUrl(format === "audio" ? track.audioUrl : track.url);
    if (!url) throw new NotFoundError("Этот опенинг пока недоступен.");
    return url;
  }
}
