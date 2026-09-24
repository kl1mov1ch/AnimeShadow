import type { WatchSource } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLocale } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { useWatchSources } from "@/lib/query";

/** One episode as the server's episode-info endpoint describes it (Kitsu). */
interface EpisodeText {
  number: number;
  title: string | null;
  titleJa: string | null;
  synopsis: string | null;
  thumb: string | null;
  airdate: string | null;
  length: number | null;
}

const hasLatinOnly = (text: string | null) => text != null && !/[а-яё]/i.test(text);

/**
 * Titles and synopses per episode, in the viewer's language. For Russian
 * the server translates in the background, so the very first answer may
 * still be English — it asks again a few times until the translation has
 * landed, then stops.
 */
function useEpisodeTexts(animeId: number) {
  const { locale } = useLocale();
  return useQuery({
    queryKey: ["anime", animeId, "episodes-info", locale],
    queryFn: ({ signal }) =>
      apiRequest<{ episodes: EpisodeText[] }>(`/anime/${animeId}/episodes-info?lang=${locale}`, {
        signal,
      }).then((r) => r.episodes),
    staleTime: 30 * 60_000,
    refetchInterval: (query) => {
      if (locale !== "ru") return false;
      const data = query.state.data;
      if (!data || query.state.dataUpdateCount > 6) return false;
      return data.some((e) => hasLatinOnly(e.synopsis)) ? 12_000 : false;
    },
  });
}

/** Everything any provider told us about one episode, merged. */
export interface EpisodeInfo {
  /** A still of this episode — AniLibria's webp first, Kodik's jpeg second. */
  thumb: string | null;
  title: string | null;
  titleEn: string | null;
  /** What happens in it, when a provider wrote it down. */
  synopsis: string | null;
  /** ISO date it first aired. */
  airdate: string | null;
  /** This episode's real length, when a provider measured it. */
  durationSeconds: number | null;
  opening: { start: number; stop: number } | null;
  /** How many of the title's dubs actually carry this episode. */
  dubs: number;
}

export interface EpisodeCatalog {
  /**
   * The highest episode any source can actually play — which, for a show
   * still airing, is not the planned total the catalogue stores. Null when
   * no source says (a plain series embed with no episode data), in which
   * case the planned total is the best there is.
   */
  available: number | null;
  info: Map<number, EpisodeInfo>;
}

/** The episode numbers one source can play, or null if it doesn't say. */
export function episodesOf(source: WatchSource): Set<number> | null {
  const keys =
    source.format === "hls"
      ? Object.keys(source.hlsEpisodes ?? {})
      : Object.keys(source.iframeEpisodes ?? {});
  if (keys.length > 0) {
    return new Set(keys.map(Number).filter((n) => Number.isInteger(n) && n > 0));
  }
  if (source.episodesCount != null && source.episodesCount > 0) {
    return new Set(Array.from({ length: source.episodesCount }, (_, i) => i + 1));
  }
  return null;
}

/**
 * One view of the episodes across every source for a title.
 *
 * The planned total in the catalogue said 24 for a show with 9 out, and the
 * list offered all 24 — clicking the 20th loaded whatever the provider's
 * page fell back to, which is how an episode that does not exist yet ends
 * up "playing". The real count is whatever the sources can serve, so that
 * is what the list is built from; the planned total is only the fallback
 * for a source that says nothing at all.
 *
 * Reads the same react-query cache entry the player does, so building this
 * costs no request.
 */
export function useEpisodeCatalog(animeId: number): EpisodeCatalog {
  const { data } = useWatchSources(animeId);
  const { data: texts } = useEpisodeTexts(animeId);
  const { locale } = useLocale();
  return useMemo(() => {
    const info = new Map<number, EpisodeInfo>();
    let available: number | null = null;

    const entry = (n: number): EpisodeInfo => {
      let e = info.get(n);
      if (!e) {
        e = {
          thumb: null,
          title: null,
          titleEn: null,
          synopsis: null,
          airdate: null,
          durationSeconds: null,
          opening: null,
          dubs: 0,
        };
        info.set(n, e);
      }
      return e;
    };

    for (const source of data?.sources ?? []) {
      const own = episodesOf(source);
      if (own) {
        for (const n of own) {
          entry(n).dubs += 1;
          available = Math.max(available ?? 0, n);
        }
      }
      // AniLibria's own metadata: titles, real lengths, openings, and a
      // small webp still that loads far more reliably than Kodik's.
      for (const [key, meta] of Object.entries(source.episodeMeta ?? {})) {
        const n = Number(key);
        if (!Number.isInteger(n)) continue;
        const e = entry(n);
        e.title ??= meta.title ?? null;
        e.titleEn ??= meta.titleEn ?? null;
        e.durationSeconds ??= meta.durationSeconds ?? null;
        e.opening ??= meta.opening ?? null;
        if (meta.thumb) e.thumb = meta.thumb;
      }
      for (const [key, episode] of Object.entries(source.iframeEpisodes ?? {})) {
        const n = Number(key);
        if (!Number.isInteger(n)) continue;
        const e = entry(n);
        e.thumb ??= episode.thumbs[0] ?? null;
      }
    }

    // Kitsu last: AniLibria's Russian names are written by people and win
    // in Russian; in English Kitsu's own titles lead. Synopses, air dates
    // and stills only Kitsu has, so they simply fill in.
    for (const text of texts ?? []) {
      const e = entry(text.number);
      if (locale === "en" && text.title) {
        e.titleEn ??= e.title;
        e.title = text.title;
      } else {
        e.title ??= text.title;
      }
      e.synopsis ??= text.synopsis;
      e.airdate ??= text.airdate;
      e.durationSeconds ??= text.length != null ? text.length * 60 : null;
      e.thumb ??= text.thumb;
    }

    return { available, info };
  }, [data, texts, locale]);
}

/** "24:05" / "1:02:10". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
