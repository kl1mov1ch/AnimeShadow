import { z } from "zod";

/** How a user is tracking a title in their personal library. */
export const libraryStatusSchema = z.enum([
  "WATCHING",
  "PLANNED",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
]);
export type LibraryStatus = z.infer<typeof libraryStatusSchema>;

export const LIBRARY_STATUS_LABELS: Record<LibraryStatus, string> = {
  WATCHING: "Watching",
  PLANNED: "Plan to watch",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
  DROPPED: "Dropped",
};

/** Normalised release format. Jikan's free-text `type` is mapped onto this. */
export const animeTypeSchema = z.enum([
  "TV",
  "MOVIE",
  "OVA",
  "ONA",
  "SPECIAL",
  "MUSIC",
  "UNKNOWN",
]);
export type AnimeType = z.infer<typeof animeTypeSchema>;

/** Normalised airing state. */
export const animeAiringSchema = z.enum([
  "AIRING",
  "FINISHED",
  "UPCOMING",
  "UNKNOWN",
]);
export type AnimeAiring = z.infer<typeof animeAiringSchema>;

export const animeSeasonSchema = z.enum(["winter", "spring", "summer", "fall"]);
export type AnimeSeason = z.infer<typeof animeSeasonSchema>;

/** Sort options exposed by the browse endpoint. */
export const animeOrderBySchema = z.enum([
  "score",
  "popularity",
  "rank",
  "title",
  "start_date",
  "episodes",
]);
export type AnimeOrderBy = z.infer<typeof animeOrderBySchema>;
