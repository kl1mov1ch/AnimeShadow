import type {
  AnimeDetail,
  AnimeSummary,
  Genre as GenreDto,
} from "@animeshadow/shared";
import {
  ANIME_WITH_GENRES_INCLUDE,
  type AnimeWithGenres,
  toAnimeListRow,
  toAnimeRow,
} from "./catalog-mappers.js";
import { prisma } from "./client.js";

/**
 * Upsert genres keyed by *name* — different providers hand the same genre
 * different ids (and Shikimori even repeats a name across two ids), so name is
 * the stable key. First writer's id wins.
 */
export async function upsertGenres(genres: GenreDto[]): Promise<void> {
  const byName = new Map<string, GenreDto>();
  for (const genre of genres) if (!byName.has(genre.name)) byName.set(genre.name, genre);
  if (byName.size === 0) return;

  for (const genre of byName.values()) {
    await prisma.genre
      .upsert({
        where: { name: genre.name },
        create: {
          id: genre.id,
          name: genre.name,
          animeCount: genre.count ?? 0,
        },
        update: genre.count != null ? { animeCount: genre.count } : {},
      })
      .catch(() => undefined);
  }
}

/** Resolve a list of genre names to their stored ids, creating any that are new. */
async function resolveGenreIds(
  genres: Array<{ id: number; name: string }>,
): Promise<number[]> {
  if (genres.length === 0) return [];
  await upsertGenres(genres.map((g) => ({ id: g.id, name: g.name })));
  const names = [...new Set(genres.map((g) => g.name))];
  const stored = await prisma.genre.findMany({
    where: { name: { in: names } },
    select: { id: true },
  });
  return stored.map((g) => g.id);
}

async function reconcileGenreLinks(
  animeId: number,
  genreIds: number[],
): Promise<void> {
  await prisma.genreOnAnime.deleteMany({
    where: {
      animeId,
      genreId: { notIn: genreIds.length > 0 ? genreIds : [-1] },
    },
  });
  if (genreIds.length > 0) {
    await prisma.genreOnAnime.createMany({
      data: genreIds.map((genreId) => ({ animeId, genreId })),
      skipDuplicates: true,
    });
  }
}

/**
 * Persist a fully-detailed anime and return the stored row with genres. This is
 * the write half of the read-through cache.
 */
export async function persistAnimeDetail(
  detail: AnimeDetail,
  extra: { kinopoiskId?: number | null } = {},
): Promise<AnimeWithGenres> {
  const row = {
    ...toAnimeRow(detail),
    ...(extra.kinopoiskId != null ? { kinopoiskId: extra.kinopoiskId } : {}),
  };

  const genreIds = await resolveGenreIds(detail.genresDetailed);

  // A detail fetch with no art must never blank out a poster a previous list
  // sync already found — omit (not null) these two on update so they're left
  // untouched, and let the heal-images fallback chain fill genuinely-missing
  // ones instead.
  const updateRow = {
    ...row,
    ...(row.imageUrl == null ? { imageUrl: undefined } : {}),
    ...(row.imageLargeUrl == null ? { imageLargeUrl: undefined } : {}),
  };

  await prisma.anime.upsert({
    where: { id: detail.id },
    create: row,
    update: updateRow,
  });
  await reconcileGenreLinks(detail.id, genreIds);

  return prisma.anime.findUniqueOrThrow({
    where: { id: detail.id },
    include: ANIME_WITH_GENRES_INCLUDE,
  });
}

/**
 * Persist a batch of list-level summaries (from `/top/anime`, `/seasons/*`,
 * search). Summaries carry genre *names* only, so links are resolved against
 * genres already known to the DB; unknown names are skipped.
 */
export async function persistAnimeSummaries(
  summaries: AnimeSummary[],
): Promise<void> {
  if (summaries.length === 0) return;

  const names = [...new Set(summaries.flatMap((s) => s.genres))];
  const knownGenres = await prisma.genre.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  const idByName = new Map(knownGenres.map((g) => [g.name, g.id]));

  for (const summary of summaries) {
    const listRow = toAnimeListRow(summary);
    await prisma.anime.upsert({
      where: { id: summary.id },
      create: listRow,
      update: listRow,
    });
    const genreIds = summary.genres
      .map((name) => idByName.get(name))
      .filter((id): id is number => id != null);
    // List/browse-page results (Shikimori's short item shape) carry no genre
    // data at all — only full detail and search responses do. Reconciling
    // with an empty set would *delete* genre links a previous detail sync
    // already wrote, so only touch them when this summary actually knows
    // something; otherwise leave whatever's stored alone.
    if (genreIds.length > 0) {
      await reconcileGenreLinks(summary.id, genreIds);
    }
  }
}
