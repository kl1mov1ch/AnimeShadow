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
    episodes: md.episodes_total ?? primary.episodes_count ?? primary.last_episode ?? null,
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

export function toWatchSources(group: KodikGroup): WatchSource[] {
  const best = new Map<string, KodikResult>();
  for (const row of group.translations) {
    if (!row.link) continue;
    const key = String(row.translation.id);
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
    .map((row): WatchSource => ({
      id: String(row.translation.id),
      title: row.translation.title,
      kind:
        row.translation.type === "voice"
          ? "voice"
          : row.translation.type === "subtitles"
            ? "subtitles"
            : "unknown",
      format: "iframe",
      embedUrl: row.link.startsWith("//") ? `https:${row.link}` : row.link,
      quality: row.quality ?? null,
      episodesCount: row.episodes_count ?? row.last_episode ?? null,
      stable: null,
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "voice" ? -1 : 1;
      return (b.episodesCount ?? 0) - (a.episodesCount ?? 0);
    });
}
