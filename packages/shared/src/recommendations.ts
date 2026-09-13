import { z } from "zod";
import { animeSummarySchema } from "./anime.js";

/** The genres a user has explicitly picked as favourites. */
export const genrePreferencesSchema = z.object({
  genreIds: z.array(z.number().int()),
});
export type GenrePreferences = z.infer<typeof genrePreferencesSchema>;

export const setGenrePreferencesInputSchema = z.object({
  genreIds: z.array(z.number().int()).max(30),
});
export type SetGenrePreferencesInput = z.infer<
  typeof setGenrePreferencesInputSchema
>;

/** A personalised or similarity-based rail — rotates day to day. */
export const recommendationResponseSchema = z.object({
  items: z.array(animeSummarySchema),
  /** Why these were picked, for a light "подобрано по …" caption. */
  basis: z.enum(["liked", "preferences", "history", "genre", "trending"]),
});
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;

/** Titles explicitly picked as "I like this" on the recommendations setup
 * page — a stronger taste signal than inferring genres from the library. */
export const likedAnimeResponseSchema = z.object({
  items: z.array(animeSummarySchema),
});
export type LikedAnimeResponse = z.infer<typeof likedAnimeResponseSchema>;

/** Whether the visitor has configured recommendations at all yet (explicit
 * genres or liked titles) — drives the unobtrusive header nudge. */
export const recommendationsStatusSchema = z.object({
  configured: z.boolean(),
});
export type RecommendationsStatus = z.infer<typeof recommendationsStatusSchema>;
