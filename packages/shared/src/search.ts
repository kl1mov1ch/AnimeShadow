import { z } from "zod";
import { animeSummarySchema } from "./anime.js";

/** Why a title showed up in smart-search results. */
export const searchReasonSchema = z.enum([
  "title",
  "character",
  "studio",
  "mood",
  "synopsis",
]);
export type SearchReason = z.infer<typeof searchReasonSchema>;

export const searchGroupSchema = z.object({
  reason: searchReasonSchema,
  /** e.g. the character's name for a "character" group */
  label: z.string().nullable(),
  items: z.array(animeSummarySchema),
});
export type SearchGroup = z.infer<typeof searchGroupSchema>;

export const smartSearchResponseSchema = z.object({
  query: z.string(),
  /** Genres/themes the query was read as (mood detection). */
  detectedGenres: z.array(z.string()),
  groups: z.array(searchGroupSchema),
  /** All results, de-duplicated and ranked, ignoring grouping. */
  flat: z.array(animeSummarySchema),
  total: z.number().int().nonnegative(),
});
export type SmartSearchResponse = z.infer<typeof smartSearchResponseSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  lang: z.enum(["ru", "en"]).default("ru"),
  limit: z.coerce.number().int().positive().max(48).default(30),
  /** Instant typeahead: title lenses only, hard-capped latency. */
  fast: z.coerce.boolean().default(false),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * "Which anime is this frame from?" — a screenshot identified by trace.moe.
 * Sent as a data URL for the same reason avatar uploads are: it keeps the
 * request plain JSON, so no multipart parser has to exist for one endpoint.
 */
export const frameSearchInputSchema = z.object({
  dataUrl: z.string().min(64),
});
export type FrameSearchInput = z.infer<typeof frameSearchInputSchema>;

export const frameMatchSchema = z.object({
  /** Our own catalogue entry, when this title is one we know. */
  anime: animeSummarySchema.nullable(),
  /** Always present — the fallback label when `anime` is null. */
  title: z.string(),
  episode: z.number().nullable(),
  /** Where in the episode the frame is, in seconds. */
  fromSeconds: z.number(),
  toSeconds: z.number(),
  /** 0-1. trace.moe's own guidance is that below ~0.87 is usually wrong. */
  similarity: z.number(),
  /** Short muted clip of the moment, straight from trace.moe. */
  previewVideo: z.string().nullable(),
  previewImage: z.string().nullable(),
});
export type FrameMatch = z.infer<typeof frameMatchSchema>;

export const frameSearchResponseSchema = z.object({
  results: z.array(frameMatchSchema),
  /** How many frames trace.moe compared against — shown as a bit of scale. */
  framesSearched: z.number().int().nonnegative(),
});
export type FrameSearchResponse = z.infer<typeof frameSearchResponseSchema>;
