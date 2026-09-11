import { z } from "zod";
import { animeSummarySchema } from "./anime.js";

export const upsertProgressInputSchema = z.object({
  episode: z.number().int().min(1).max(100_000),
  positionSeconds: z.number().int().min(0).max(200_000),
  durationSeconds: z.number().int().min(0).max(200_000).nullable().optional(),
  completed: z.boolean().optional(),
  translationId: z.string().max(64).nullable().optional(),
});
export type UpsertProgressInput = z.infer<typeof upsertProgressInputSchema>;

export const episodeProgressSchema = z.object({
  episode: z.number().int(),
  positionSeconds: z.number().int(),
  durationSeconds: z.number().int().nullable(),
  completed: z.boolean(),
  updatedAt: z.string(),
});
export type EpisodeProgress = z.infer<typeof episodeProgressSchema>;

/** All progress for one anime, for the current user. */
export const animeProgressSchema = z.object({
  animeId: z.number().int(),
  episodes: z.array(episodeProgressSchema),
  /** Where "resume" should land: last touched, not-yet-completed episode. */
  resumeEpisode: z.number().int().nullable(),
  resumePositionSeconds: z.number().int(),
  lastTranslationId: z.string().nullable(),
  watchedCount: z.number().int(),
});
export type AnimeProgress = z.infer<typeof animeProgressSchema>;

export const continueWatchingItemSchema = z.object({
  anime: animeSummarySchema,
  episode: z.number().int(),
  positionSeconds: z.number().int(),
  durationSeconds: z.number().int().nullable(),
  updatedAt: z.string(),
});
export type ContinueWatchingItem = z.infer<typeof continueWatchingItemSchema>;
