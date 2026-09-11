import {
  type AnimeAiring,
  type AnimeDetail,
  type AnimeSeason,
  type AnimeSummary,
  type AnimeType,
  type Character,
  type Genre,
  slugify,
} from "@animeshadow/shared";
import type {
  JikanAnime,
  JikanCharacterEntry,
  JikanGenre,
  JikanImageSet,
} from "./types.js";

export function mapType(raw: string | null | undefined): AnimeType {
  switch ((raw ?? "").toUpperCase()) {
    case "TV":
    case "TV SPECIAL":
      return "TV";
    case "MOVIE":
      return "MOVIE";
    case "OVA":
      return "OVA";
    case "ONA":
      return "ONA";
    case "SPECIAL":
      return "SPECIAL";
    case "MUSIC":
    case "PV":
    case "CM":
      return "MUSIC";
    default:
      return "UNKNOWN";
  }
}

export function mapAiring(
  status: string | null | undefined,
  airing: boolean | undefined,
): AnimeAiring {
  if (airing) return "AIRING";
  const value = (status ?? "").toLowerCase();
  if (value.includes("currently")) return "AIRING";
  if (value.includes("finished")) return "FINISHED";
  if (value.includes("not yet")) return "UPCOMING";
  return "UNKNOWN";
}

function mapSeason(raw: string | null | undefined): AnimeSeason | null {
  const value = (raw ?? "").toLowerCase();
  return value === "winter" || value === "spring" || value === "summer" || value === "fall"
    ? value
    : null;
}

function deriveYear(from: string | null | undefined): number | null {
  if (!from) return null;
  const year = new Date(from).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

function pickImage(images: JikanImageSet | undefined, large: boolean): string | null {
  const set = images?.webp ?? images?.jpg;
  if (!set) return null;
  return (large ? set.large_image_url ?? set.image_url : set.image_url) ?? null;
}

export function toAnimeSummary(raw: JikanAnime): AnimeSummary {
  const title = raw.title_english?.trim() || raw.title;
  return {
    id: raw.mal_id,
    slug: slugify(`${raw.mal_id}-${title}`),
    title: raw.title,
    titleEnglish: raw.title_english ?? null,
    titleJapanese: raw.title_japanese ?? null,
    imageUrl: pickImage(raw.images, false),
    imageLargeUrl: pickImage(raw.images, true),
    type: mapType(raw.type),
    airing: mapAiring(raw.status, raw.airing),
    episodes: raw.episodes ?? null,
    score: raw.score ?? null,
    year: raw.year ?? deriveYear(raw.aired?.from),
    season: mapSeason(raw.season),
    rank: raw.rank ?? null,
    members: raw.members ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    synopsis: raw.synopsis ?? null,
    airedFrom: raw.aired?.from ?? null,
    titleLocalized: null,
    hasPlayer: null,
    rating: raw.rating ?? null,
    scoredBy: raw.scored_by ?? null,
    trailerEmbedUrl: normaliseTrailer(raw.trailer?.embed_url),
  };
}

export function toAnimeDetail(raw: JikanAnime): AnimeDetail {
  return {
    ...toAnimeSummary(raw),
    background: raw.background ?? null,
    source: raw.source ?? null,
    rating: raw.rating ?? null,
    duration: raw.duration ?? null,
    popularity: raw.popularity ?? null,
    favorites: raw.favorites ?? null,
    scoredBy: raw.scored_by ?? null,
    airedFrom: raw.aired?.from ?? null,
    airedTo: raw.aired?.to ?? null,
    trailerEmbedUrl: normaliseTrailer(raw.trailer?.embed_url),
    studios: (raw.studios ?? []).map((s) => s.name),
    genresDetailed: [
      ...(raw.genres ?? []),
      ...(raw.explicit_genres ?? []),
    ].map((g) => ({ id: g.mal_id, name: g.name })),
    themes: (raw.themes ?? []).map((t) => t.name),
    demographics: (raw.demographics ?? []).map((d) => d.name),
    screenshots: [],
    titleLocalized: null,
    translated: false,
  };
}

function normaliseTrailer(embedUrl: string | null | undefined): string | null {
  if (!embedUrl) return null;
  // Strip autoplay so opening a detail page doesn't blast audio.
  try {
    const url = new URL(embedUrl);
    url.searchParams.delete("autoplay");
    url.searchParams.set("rel", "0");
    return url.toString();
  } catch {
    return embedUrl;
  }
}

export function toGenre(raw: JikanGenre): Genre {
  return { id: raw.mal_id, name: raw.name, count: raw.count };
}

export function toCharacter(raw: JikanCharacterEntry): Character {
  const primaryVa =
    raw.voice_actors?.find((va) => va.language === "Japanese") ??
    raw.voice_actors?.[0] ??
    null;
  return {
    id: raw.character.mal_id,
    name: raw.character.name,
    imageUrl: pickImage(raw.character.images, false),
    role: raw.role,
    voiceActor: primaryVa
      ? {
          name: primaryVa.person.name,
          language: primaryVa.language,
          imageUrl: pickImage(primaryVa.person.images, false),
        }
      : null,
  };
}
