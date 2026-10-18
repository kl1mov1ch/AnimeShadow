import {
  type AnimeAiring,
  type AnimeDetail,
  type AnimeSeason,
  type AnimeSummary,
  type AnimeType,
  type Genre,
  slugify,
  type WatchSource,
} from "@animeshadow/shared";
import type { KodikGroup, KodikMaterialData, KodikResult } from "./types.js";

export function mapKind(kind: string | null | undefined): AnimeType {
  switch ((kind ?? "").toLowerCase()) {
    case "tv":
    case "tv13":
    case "tv24":
    case "tv48":
      return "TV";
    case "movie":
      return "MOVIE";
    case "ova":
      return "OVA";
    case "ona":
      return "ONA";
    case "special":
      return "SPECIAL";
    case "music":
      return "MUSIC";
    default:
      return "UNKNOWN";
  }
}

export function mapStatus(status: string | null | undefined): AnimeAiring {
  switch ((status ?? "").toLowerCase()) {
    case "released":
      return "FINISHED";
    case "ongoing":
      return "AIRING";
    case "anons":
      return "UPCOMING";
    default:
      return "UNKNOWN";
  }
}

function deriveYear(md: KodikMaterialData, primary: KodikResult): number | null {
  if (md.year) return md.year;
  if (primary.year) return primary.year;
  const from = md.aired_at ?? md.released_at ?? md.premiere_world;
  if (!from) return null;
  const y = new Date(from).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}

function deriveSeason(md: KodikMaterialData): AnimeSeason | null {
  const from = md.aired_at ?? md.premiere_world;
  if (!from) return null;
  const month = new Date(from).getUTCMonth();
  if (Number.isNaN(month)) return null;
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Deterministic positive int id for a genre name (Kodik has no genre ids). */
export function genreId(name: string): number {
  let hash = 0;
  for (const ch of name.toLowerCase()) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 2_000_000_000) + 1;
}

function genreNames(md: KodikMaterialData): string[] {
  const names = md.anime_genres?.length ? md.anime_genres : (md.genres ?? []);
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

export function toAnimeSummary(group: KodikGroup): AnimeSummary {
  const { primary } = group;
  const md = primary.material_data ?? {};
  const english = primary.title_orig?.trim() || md.title_en?.trim() || null;
  const canonical = english ?? md.anime_title ?? primary.title;

  return {
    id: group.shikimoriId,
    slug: slugify(`${group.shikimoriId}-${canonical}`),
    title: canonical,
    titleEnglish: english,
    titleJapanese: md.other_titles_jp?.[0] ?? null,
    imageUrl: md.anime_poster_url ?? md.poster_url ?? null,
    imageLargeUrl: md.anime_poster_url ?? md.poster_url ?? null,
    type: mapKind(md.anime_kind),
    airing: mapStatus(md.all_status ?? md.anime_status),
    episodes:
      md.episodes_total ?? primary.episodes_count ?? primary.last_episode ?? null,
    score: md.shikimori_rating ?? null,
    year: deriveYear(md, primary),
    season: deriveSeason(md),
    rank: null,
    members: md.shikimori_votes ?? null,
    genres: genreNames(md),
    synopsis: md.anime_description ?? md.description ?? null,
    airedFrom: md.aired_at ?? null,
    titleLocalized: md.anime_title ?? md.title ?? null,
    hasPlayer: true,
    hasCustomPlayer: false,
    rating: null,
    scoredBy: md.shikimori_votes ?? null,
    trailerEmbedUrl: null,
  };
}

export function toAnimeDetail(group: KodikGroup): AnimeDetail {
  const { primary } = group;
  const md = primary.material_data ?? {};
  return {
    ...toAnimeSummary(group),
    background: null,
    source: null,
    rating: md.rating_mpaa ?? null,
    duration: md.duration ? `${md.duration} мин.` : null,
    popularity: null,
    favorites: null,
    scoredBy: md.shikimori_votes ?? null,
    airedFrom: toIso(md.aired_at),
    airedTo: toIso(md.released_at),
    trailerEmbedUrl: null,
    studios: md.anime_studios ?? [],
    genresDetailed: genreNames(md).map((name) => ({ id: genreId(name), name })),
    themes: [],
    demographics: [],
    screenshots: [],
    bannerImage: null,
    accentColor: null,
    titleLocalized: md.anime_title ?? md.title ?? null,
    translated: false,
  };
}

export function toGenreList(kodikGenres: { title: string; count: number }[]): Genre[] {
  return kodikGenres
    .filter((g) => g.title && g.count > 0)
    .map((g) => ({ id: genreId(g.title), name: g.title, count: g.count }));
}

/** `//host/path` → `https://host/path`; anything already absolute is left be. */
function absolute(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

/**
 * Every episode Kodik lists for a row, flattened across its seasons.
 *
 * The API nests episodes under seasons, but this project addresses a title
 * by the provider's positive episode numbers. Season 0 holds specials that
 * have separate catalogue identities, so it must never overwrite episode 1.
 * A row that came back without
 * `with_episodes_data` simply yields nothing, and the caller falls back to
 * the one series-wide embed URL.
 */
export function toEpisodeMap(
  row: KodikResult,
): Record<string, { url: string; thumbs: string[] }> {
  const out: Record<string, { url: string; thumbs: string[] }> = {};
  const usedUrls = new Set<string>();
  const seasons = Object.entries(row.seasons ?? {}).sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  for (const [seasonNumber, season] of seasons) {
    if (Number(seasonNumber) === 0) continue;
    const episodes = Object.entries(season.episodes ?? {}).sort(
      ([a], [b]) => Number(a) - Number(b),
    );
    for (const [number, episode] of episodes) {
      if (!/^[1-9]\d*$/.test(number) || out[number]) continue;
      const link = typeof episode === "string" ? episode : episode.link;
      if (!link) continue;
      const thumbs = typeof episode === "string" ? [] : (episode.screenshots ?? []);
      const url = absolute(link);
      // A provider sometimes repeats a series URL for several episode numbers.
      // Such entries must not become several buttons playing the same video.
      if (usedUrls.has(url)) continue;
      usedUrls.add(url);
      out[number] = { url, thumbs };
    }
  }
  return out;
}

export function toWatchSources(group: KodikGroup): WatchSource[] {
  const best = new Map<string, KodikResult>();
  const rows = new Map<string, KodikResult[]>();
  for (const row of group.translations) {
    if (!row.link) continue;
    const key = String(row.translation.id);
    rows.set(key, [...(rows.get(key) ?? []), row]);
    const current = best.get(key);
    if (
      !current ||
      (row.episodes_count ?? row.last_episode ?? 0) >
        (current.episodes_count ?? current.last_episode ?? 0)
    ) {
      best.set(key, row);
    }
  }

  return [...best.values()]
    .map((row): WatchSource => {
      const episodes = toEpisodeMap(row);
      const used = new Set(Object.values(episodes).map((entry) => entry.url));
      // Keep complementary episodes from duplicate rows of the same verified
      // title and dub. Never overwrite an existing episode with another row.
      for (const alternate of rows.get(String(row.translation.id)) ?? []) {
        for (const [number, entry] of Object.entries(toEpisodeMap(alternate))) {
          if (episodes[number] || used.has(entry.url)) continue;
          episodes[number] = entry;
          used.add(entry.url);
        }
      }
      return {
        id: String(row.translation.id),
        title: row.translation.title,
        kind:
          row.translation.type === "voice"
            ? "voice"
            : row.translation.type === "subtitles"
              ? "subtitles"
              : "unknown",
        format: "iframe",
        embedUrl: absolute(row.link),
        iframeEpisodes: episodes,
        quality: row.quality ?? null,
        episodesCount:
          Object.keys(episodes).length ||
          row.episodes_count ||
          row.last_episode ||
          null,
        stable: null,
      };
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "voice" ? -1 : 1;
      return (b.episodesCount ?? 0) - (a.episodesCount ?? 0);
    });
}
