import type { BrowseParams } from "@/lib/query";

export const SORT_VALUES = [
  "fresh",
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
    // Browsing opens on popular new titles; a search keeps its relevance order.
    orderBy: search.get("orderBy") || (search.get("q")?.trim() ? "popularity" : "fresh"),
    sort: (search.get("sort") as "asc" | "desc") || "desc",
    minScore: num("minScore"),
    year: num("year"),
    genres: genres.length > 0 ? genres : undefined,
    hasPlayer: search.get("hasPlayer") === "1" ? true : undefined,
    studio: search.get("studio")?.trim() || undefined,
    dubbingStudio: search.get("dubbingStudio") === "hon-kon" ? "hon-kon" : undefined,
    rating: ["g", "pg", "pg13", "r17", "rplus"].includes(search.get("rating") ?? "") ? (search.get("rating") as string) : undefined,
    maxScore: num("maxScore"),
    excludeGenres: excludeGenres.length > 0 ? excludeGenres : undefined,
    yearFrom: num("yearFrom"),
    yearTo: num("yearTo"),
    episodesMin: num("episodesMin"),
    episodesMax: num("episodesMax"),
    hideListed: search.get("hideListed") === "1" ? true : undefined,
    allTitles: search.get("all") === "1" ? true : undefined,
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
      params.dubbingStudio ||
      params.rating ||
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

/** How many filters are on — what the "Фильтры" button counts. */
export function activeFilterCount(params: BrowseParams): number {
  return [
    Boolean(params.type),
    Boolean(params.airing),
    params.yearFrom != null || params.yearTo != null || Boolean(params.year),
    Boolean(params.minScore || params.maxScore != null),
    params.episodesMin != null || params.episodesMax != null,
    Boolean(params.studio),
    Boolean(params.dubbingStudio),
    Boolean(params.rating),
    (params.genres?.length ?? 0) + (params.excludeGenres?.length ?? 0) > 0,
    params.hasPlayer === true,
    params.hasCustomPlayer === true,
    params.hideListed === true,
  ].filter(Boolean).length;
}
