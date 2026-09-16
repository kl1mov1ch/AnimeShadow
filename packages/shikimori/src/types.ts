// Slices of the Shikimori REST API (https://shikimori.one/api/doc/1.0).

export interface ShikiImage {
  original?: string | null;
  preview?: string | null;
  x96?: string | null;
  x48?: string | null;
}

export interface ShikiGenre {
  id: number;
  name: string;
  russian: string;
  kind: string; // "genre" | "theme" | "demographic"
  entry_type?: string;
}

export interface ShikiStudio {
  id: number;
  name: string;
  filtered_name?: string;
  real?: boolean;
  image?: string | null;
}

export interface ShikiVideo {
  id: number;
  url: string;
  image_url?: string;
  player_url?: string;
  name?: string | null;
  kind?: string; // "pv" | "op" | "ed" | ...
  hosting?: string;
}

/** `/api/animes` list item (compact). */
export interface ShikiAnimeShort {
  id: number;
  name: string;
  russian: string | null;
  image: ShikiImage;
  url: string;
  kind: string | null;
  score: string | null;
  status: string | null;
  episodes: number;
  episodes_aired: number;
  aired_on: string | null;
  released_on: string | null;
}

/** `/api/animes/:id` full object. */
export interface ShikiAnimeFull extends ShikiAnimeShort {
  rating: string | null; // "r", "pg_13", ...
  english: string[] | null;
  japanese: string[] | null;
  synonyms: string[] | null;
  duration: number | null;
  description: string | null;
  description_html: string | null;
  franchise: string | null;
  favoured: boolean;
  anons: boolean;
  ongoing: boolean;
  myanimelist_id: number | null;
  rates_scores_stats: Array<{ name: number; value: number }>;
  rates_statuses_stats: Array<{ name: string; value: number }>;
  genres: ShikiGenre[];
  studios: ShikiStudio[];
  videos: ShikiVideo[];
  screenshots: Array<{ original: string; preview: string }>;
}

/** `/api/mangas` list item (compact) — same shape as an anime short, minus episode fields. */
export interface ShikiMangaShort {
  id: number;
  name: string;
  russian: string | null;
  image: ShikiImage;
  url: string;
  kind: string | null; // "manga" | "manhwa" | "manhua" | "one_shot" | ...
  score: string | null;
  status: string | null;
  volumes: number;
  chapters: number;
  aired_on: string | null;
  released_on: string | null;
}

/** `/api/animes/:id/franchise` node — every title sharing this one's continuity. */
export interface ShikiFranchiseNode {
  id: number;
  name: string;
  image_url: string | null;
  url: string;
  year: number | null;
  kind: string | null; // "tv" | "movie" | "ova" | "ona" | "special" | ...
  weight: number;
}

export interface ShikiFranchise {
  current_id: number;
  nodes: ShikiFranchiseNode[];
  links: Array<{ source_id: number; target_id: number; weight: number }>;
}

export interface ShikiRole {
  roles: string[]; // ["Main"], ["Supporting"], ...
  roles_russian: string[];
  character: {
    id: number;
    name: string;
    russian: string | null;
    image: ShikiImage;
  } | null;
  person: {
    id: number;
    name: string;
    russian: string | null;
    image: ShikiImage;
  } | null;
}

export interface ShikiCharacterSearch {
  id: number;
  name: string;
  russian: string | null;
  image: ShikiImage;
}

export interface ShikiListParams {
  page?: number;
  limit?: number;
  order?: string; // popularity, ranked, aired_on, name, random, ...
  kind?: string;
  status?: string; // anons, ongoing, released
  season?: string; // "2024", "winter_2024", "2010_2014"
  score?: number;
  genre?: string; // comma-separated ids
  studio?: string;
  franchise?: string;
  search?: string;
  censored?: boolean;
  ids?: string;
}
