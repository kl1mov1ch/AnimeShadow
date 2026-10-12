import { z } from "zod";
import { animeSummarySchema } from "./anime.js";
import { animeAiringSchema, animeTypeSchema } from "./enums.js";

/** Why a title showed up in smart-search results. */
export const searchReasonSchema = z.enum([
  "title",
  "character",
  "studio",
  "mood",
  "synopsis",
  /** "похоже на …": titles like the one named. */
  "similar",
  /** Nothing but filters read from the query ("фильмы 2020"). */
  "filters",
]);
export type SearchReason = z.infer<typeof searchReasonSchema>;

/**
 * Where to look. "all" asks every lens; the others ask one — less work for
 * the server, and the way to find a character whose name is also a title.
 */
export const searchScopeSchema = z.enum(["all", "title", "character", "studio", "plot"]);
export type SearchScope = z.infer<typeof searchScopeSchema>;

/** What the query was read as, besides the words themselves. */
export const parsedSearchSchema = z.object({
  /** The words left once the filters below were taken out. */
  rest: z.string(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  type: animeTypeSchema.nullable(),
  airing: animeAiringSchema.nullable(),
  /** "похоже на Наруто" — the title the results are like. */
  similarTo: z
    .object({ id: z.number().int(), slug: z.string(), title: z.string() })
    .nullable(),
});
export type ParsedSearch = z.infer<typeof parsedSearchSchema>;

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
  /** Filters and "похоже на" read from the query; absent from older servers. */
  parsed: parsedSearchSchema.optional(),
  /** Title id → the other name it was found by ("AoT", "Вторжение
   *  гигантов"), when that is not the name shown. */
  aka: z.record(z.string(), z.string()).optional(),
});
export type SmartSearchResponse = z.infer<typeof smartSearchResponseSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  lang: z.enum(["ru", "en"]).default("ru"),
  limit: z.coerce.number().int().positive().max(48).default(30),
  /** Instant typeahead: title lenses only, hard-capped latency. */
  fast: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(false),
  scope: searchScopeSchema.default("all"),
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

/** A search someone actually made — sent on Enter or on picking a result. */
export const searchLogInputSchema = z.object({
  term: z.string().trim().min(2).max(60),
});

/** What the empty search window offers: what people look for now, titles
 *  being watched, and the genres watched most. */
export interface SearchPulse {
  searches: Array<{ term: string; count: number }>;
  hot: Array<{ id: number; slug: string; title: string; titleLocalized: string | null }>;
  genres: Array<{ id: number; name: string }>;
}
