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

/**
 * How much of a synopsis a *card* is allowed to carry.
 *
 * Nothing that renders an AnimeSummary shows more than a few lines of it: the
 * grid card shows none at all, the hover preview clamps to four lines and a
 * search row to one. Sending the whole thing anyway made synopsis text 54% of
 * the homepage payload — 129KB of 237KB — most of it for cards on a phone,
 * where there is no hover and it is never read. The detail page has its own
 * full copy on AnimeDetail and is unaffected.
 */
const SUMMARY_SYNOPSIS_CHARS = 300;

function cardSynopsis(text: string | null): string | null {
  if (!text) return null;
  if (text.length <= SUMMARY_SYNOPSIS_CHARS) return text;
  // Cut on a word boundary so the clamp does not end mid-word.
  const cut = text.slice(0, SUMMARY_SYNOPSIS_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
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
    synopsis: cardSynopsis(row.synopsis),
    airedFrom: row.airedFrom?.toISOString() ?? null,
    hasPlayer: row.watchAvailability?.hasPlayer ?? null,
    hasCustomPlayer: row.watchAvailability?.hasCustomPlayer ?? false,
    rating: row.rating,
    scoredBy: row.scoredBy,
    trailerEmbedUrl: row.trailerEmbedUrl,
  };
}

export function toDetailDto(row: AnimeWithGenres): AnimeDetail {
  return {
    ...toSummaryDto(row),
    // Restored in full: the spread above carries the card-sized excerpt, and
    // the detail page is the one place that actually renders the whole thing.
    synopsis: row.synopsis,
    background: row.background,
    source: row.source,
    duration: row.duration,
    popularity: row.popularity,
    favorites: row.favorites,
    airedFrom: row.airedFrom?.toISOString() ?? null,
    airedTo: row.airedTo?.toISOString() ?? null,
    studios: row.studios,
    screenshots: row.screenshots ?? [],
    bannerImage: row.bannerImage ?? null,
    accentColor: row.accentColor ?? null,
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
