// Minimal typings for the slices of the Jikan v4 API this app consumes.
// See https://docs.api.jikan.moe/

export interface JikanImageSet {
  jpg?: { image_url?: string | null; large_image_url?: string | null; small_image_url?: string | null };
  webp?: { image_url?: string | null; large_image_url?: string | null; small_image_url?: string | null };
}

export interface JikanNamedResource {
  mal_id: number;
  type?: string;
  name: string;
  url?: string;
}

export interface JikanDateRange {
  from: string | null;
  to: string | null;
}

export interface JikanTrailer {
  youtube_id?: string | null;
  url?: string | null;
  embed_url?: string | null;
}

export interface JikanAnime {
  mal_id: number;
  url?: string;
  images?: JikanImageSet;
  trailer?: JikanTrailer;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  type?: string | null;
  source?: string | null;
  episodes?: number | null;
  status?: string | null;
  airing?: boolean;
  aired?: JikanDateRange;
  duration?: string | null;
  rating?: string | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  synopsis?: string | null;
  background?: string | null;
  season?: string | null;
  year?: number | null;
  studios?: JikanNamedResource[];
  genres?: JikanNamedResource[];
  explicit_genres?: JikanNamedResource[];
  themes?: JikanNamedResource[];
  demographics?: JikanNamedResource[];
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page?: number;
  items?: { count: number; total: number; per_page: number };
}

export interface JikanList<T> {
  data: T[];
  pagination?: JikanPagination;
}

export interface JikanCharacterEntry {
  character: { mal_id: number; name: string; images?: JikanImageSet };
  role: string;
  voice_actors?: Array<{
    language: string;
    person: { mal_id: number; name: string; images?: JikanImageSet };
  }>;
}

/** From `/characters?q=` — a character plus the anime it appears in. */
export interface JikanCharacterSearchEntry {
  mal_id: number;
  name: string;
  name_kanji?: string | null;
  images?: JikanImageSet;
  favorites?: number;
  about?: string | null;
  anime?: Array<{
    role: string;
    anime: JikanAnime;
  }>;
}

export interface JikanRecommendationEntry {
  entry: { mal_id: number; title: string; images?: JikanImageSet };
  votes?: number;
}

export interface JikanGenre extends JikanNamedResource {
  count?: number;
}

export interface JikanSearchParams {
  q?: string;
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  genres?: string;
  min_score?: number;
  order_by?: string;
  sort?: "asc" | "desc";
  sfw?: boolean;
  start_date?: string;
  end_date?: string;
}
