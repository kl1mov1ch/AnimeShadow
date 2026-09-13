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
