import type { AnimeDetail, AnimeSummary } from "@animeshadow/shared";
import type {
  Anime,
  Genre,
  GenreOnAnime,
  Prisma,
  WatchAvailability,
} from "./generated/client/index.js";

export type AnimeWithGenres = Anime & {
  genres: Array<GenreOnAnime & { genre: Genre }>;
  watchAvailability?: WatchAvailability | null;
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Scalar columns for an `anime` row, derived from a Jikan-sourced DTO. Safe to
 * use as both `create` and `update` payloads for `prisma.anime.upsert`.
 * Genre links are handled separately (explicit join table) by the caller.
 */
export type AnimeRow = Omit<
  Prisma.AnimeUncheckedCreateInput,
  "genres" | "libraryEntries"
>;

export function toAnimeRow(dto: AnimeDetail | AnimeSummary): AnimeRow {
  const detail = "studios" in dto ? dto : null;
  return {
    id: dto.id,
    slug: dto.slug,
    title: dto.title,
    titleEnglish: dto.titleEnglish,
    titleJapanese: dto.titleJapanese,
    titleLocalized: detail?.titleLocalized ?? null,
    synopsis: dto.synopsis,
    background: detail?.background ?? null,
    imageUrl: dto.imageUrl,
    imageLargeUrl: dto.imageLargeUrl,
    type: dto.type,
    airing: dto.airing,
    episodes: dto.episodes,
    duration: detail?.duration ?? null,
    rating: detail?.rating ?? null,
    source: detail?.source ?? null,
    score: dto.score,
    scoredBy: detail?.scoredBy ?? null,
    rank: dto.rank,
    popularity: detail?.popularity ?? null,
    members: dto.members,
    favorites: detail?.favorites ?? null,
    year: dto.year,
    season: dto.season,
    airedFrom: toDate(dto.airedFrom),
    airedTo: detail ? toDate(detail.airedTo) : null,
    trailerEmbedUrl: detail?.trailerEmbedUrl ?? null,
    studios: detail?.studios ?? [],
    themes: detail?.themes ?? [],
    demographics: detail?.demographics ?? [],
    screenshots: detail?.screenshots ?? [],
    syncedAt: new Date(),
    ...(detail ? { detailSyncedAt: new Date() } : {}),
  };
}

/**
 * The subset of columns a list/search result is authoritative for. Used for
 * both create and update so a catalogue refresh never clobbers the richer
 * fields written by a detail fetch (synopsis stays, studios stay, etc.).
 */
export function toAnimeListRow(dto: AnimeSummary): AnimeRow {
  return {
    id: dto.id,
    slug: dto.slug,
    title: dto.title,
    titleEnglish: dto.titleEnglish,
    titleJapanese: dto.titleJapanese,
    titleLocalized: dto.titleLocalized ?? null,
    synopsis: dto.synopsis,
    imageUrl: dto.imageUrl,
    imageLargeUrl: dto.imageLargeUrl,
    type: dto.type,
    airing: dto.airing,
    episodes: dto.episodes,
    score: dto.score,
    rank: dto.rank,
    members: dto.members,
    year: dto.year,
    season: dto.season,
    airedFrom: toDate(dto.airedFrom),
    syncedAt: new Date(),
  };
}

export function toSummaryDto(row: AnimeWithGenres): AnimeSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    titleEnglish: row.titleEnglish,
    titleJapanese: row.titleJapanese,
    titleLocalized: row.titleLocalized ?? null,
    imageUrl: row.imageUrl,
    imageLargeUrl: row.imageLargeUrl,
    type: row.type,
    airing: row.airing,
    episodes: row.episodes,
    score: row.score,
    year: row.year,
    season: row.season,
    rank: row.rank,
    members: row.members,
    genres: row.genres.map((link) => link.genre.name),
    synopsis: row.synopsis,
    airedFrom: row.airedFrom?.toISOString() ?? null,
    hasPlayer: row.watchAvailability?.hasPlayer ?? null,
    rating: row.rating,
    scoredBy: row.scoredBy,
    trailerEmbedUrl: row.trailerEmbedUrl,
  };
}

export function toDetailDto(row: AnimeWithGenres): AnimeDetail {
  return {
    ...toSummaryDto(row),
    background: row.background,
    source: row.source,
    duration: row.duration,
    popularity: row.popularity,
    favorites: row.favorites,
    airedFrom: row.airedFrom?.toISOString() ?? null,
    airedTo: row.airedTo?.toISOString() ?? null,
    studios: row.studios,
    screenshots: row.screenshots ?? [],
    genresDetailed: row.genres.map((link) => ({
      id: link.genre.id,
      name: link.genre.name,
    })),
    themes: row.themes,
    demographics: row.demographics,
    translated: false,
  };
}

export const ANIME_WITH_GENRES_INCLUDE = {
  genres: { include: { genre: true } },
  watchAvailability: true,
} satisfies Prisma.AnimeInclude;
