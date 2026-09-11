// Slices of the Kodik API (https://kodik-api.com) this app consumes.
// Reference: https://github.com/YaNesyTortiK/AnimeParsers/blob/main/KODIK_API.md

export interface KodikTranslation {
  id: number;
  title: string;
  type: "voice" | "subtitles";
}

export interface KodikMaterialData {
  title?: string | null;
  anime_title?: string | null;
  title_en?: string | null;
  other_titles_jp?: string[] | null;
  anime_kind?: string | null; // tv, tv13, tv24, tv48, movie, special, ova, ona, music
  all_status?: string | null; // released, ongoing, anons
  anime_status?: string | null;
  year?: number | null;
  description?: string | null;
  anime_description?: string | null;
  poster_url?: string | null;
  anime_poster_url?: string | null;
  screenshots?: string[] | null;
  duration?: number | null;
  countries?: string[] | null;
  genres?: string[] | null;
  anime_genres?: string[] | null;
  all_genres?: string[] | null;
  anime_studios?: string[] | null;
  shikimori_rating?: number | null;
  shikimori_votes?: number | null;
  imdb_rating?: number | null;
  kinopoisk_rating?: number | null;
  aired_at?: string | null;
  released_at?: string | null;
  premiere_world?: string | null;
  rating_mpaa?: string | null;
  minimal_age?: number | null;
  episodes_total?: number | null;
  episodes_aired?: number | null;
}

export interface KodikResult {
  id: string; // e.g. "serial-7963"
  type: string; // anime, anime-serial, ...
  link: string; // "//kodikplayer.com/serial/7963/<hash>/720p"
  title: string;
  title_orig?: string | null;
  other_title?: string | null;
  translation: KodikTranslation;
  year?: number | null;
  quality?: string | null;
  last_season?: number | null;
  last_episode?: number | null;
  episodes_count?: number | null;
  shikimori_id?: number | string | null;
  kinopoisk_id?: number | string | null;
  imdb_id?: string | null;
  worldart_link?: string | null;
  screenshots?: string[] | null;
  created_at?: string;
  updated_at?: string;
  material_data?: KodikMaterialData | null;
}

export interface KodikResponse<T> {
  time: string;
  total: number;
  next_page?: string | null;
  prev_page?: string | null;
  results: T[];
}

export interface KodikGenre {
  title: string;
  count: number;
}

export interface KodikListParams {
  types?: string;
  sort?:
    | "year"
    | "created_at"
    | "updated_at"
    | "shikimori_rating"
    | "imdb_rating"
    | "kinopoisk_rating";
  order?: "asc" | "desc";
  anime_status?: "released" | "ongoing" | "anons";
  anime_kind?: string;
  genres?: string;
  anime_genres?: string;
  year?: number;
  shikimori_rating?: number;
  limit?: number;
  not_blocked_in?: string;
}

export interface KodikSearchParams extends KodikListParams {
  title?: string;
  title_orig?: string;
  shikimori_id?: number;
  strict?: boolean;
}

/** One anime, with every translation/voiceover Kodik has for it. */
export interface KodikGroup {
  shikimoriId: number;
  /** Best result to read metadata from (has material_data, most episodes). */
  primary: KodikResult;
  translations: KodikResult[];
}
