import type { BrowseParams } from "@/lib/query";

export const SORT_VALUES = [
  "popularity",
  "score",
  "rank",
  "start_date",
  "title",
] as const;

export const TYPE_VALUES = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL"] as const;

export const AIRING_VALUES = ["AIRING", "FINISHED", "UPCOMING"] as const;

// 24: it divides evenly into every column count the grid uses (2/3/4/6),
// so the last row of a page is always full.
const PER_PAGE = 24;

export function parseBrowseParams(search: URLSearchParams): Required<
  Pick<BrowseParams, "page" | "perPage" | "orderBy" | "sort">
> &
  BrowseParams {
  const num = (key: string): number | undefined => {
    const raw = search.get(key);
    if (raw == null || raw === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  const ids = (key: string) =>
    (search.get(key) ?? "")
      .split(",")
      .map((entry) => Number.parseInt(entry, 10))
      .filter((entry) => Number.isInteger(entry));
  const genres = ids("genres");
  const excludeGenres = ids("excludeGenres");

  return {
    q: search.get("q")?.trim() || undefined,
    page: num("page") ?? 1,
    perPage: PER_PAGE,
    type: search.get("type") || undefined,
    airing: search.get("airing") || undefined,
    season: search.get("season") || undefined,
    orderBy: search.get("orderBy") || "popularity",
    sort: (search.get("sort") as "asc" | "desc") || "desc",
    minScore: num("minScore"),
    year: num("year"),
    genres: genres.length > 0 ? genres : undefined,
    hasPlayer: search.get("hasPlayer") === "1" ? true : undefined,
    hasCustomPlayer: search.get("hasCustomPlayer") === "1" ? true : undefined,
    studio: search.get("studio")?.trim() || undefined,
    maxScore: num("maxScore"),
    excludeGenres: excludeGenres.length > 0 ? excludeGenres : undefined,
    yearFrom: num("yearFrom"),
    yearTo: num("yearTo"),
    episodesMin: num("episodesMin"),
    episodesMax: num("episodesMax"),
    hideListed: search.get("hideListed") === "1" ? true : undefined,
  };
}

export function hasActiveFilters(params: BrowseParams): boolean {
  return Boolean(
    params.q ||
      params.type ||
      params.airing ||
      params.season ||
      params.minScore ||
      params.year ||
      params.hasPlayer ||
      params.hasCustomPlayer ||
      params.studio ||
      params.maxScore != null ||
      params.yearFrom != null ||
      params.yearTo != null ||
      params.episodesMin != null ||
      params.episodesMax != null ||
      params.hideListed ||
      (params.excludeGenres && params.excludeGenres.length > 0) ||
      (params.genres && params.genres.length > 0) ||
      (params.orderBy && params.orderBy !== "popularity"),
  );
}
