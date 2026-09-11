import { z } from "zod";
import { animeSummarySchema } from "./anime.js";
import { libraryStatusSchema } from "./enums.js";

export const upsertLibraryInputSchema = z.object({
  status: libraryStatusSchema,
  score: z.number().int().min(1).max(10).nullable().optional(),
  progress: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2_000).nullable().optional(),
});
export type UpsertLibraryInput = z.infer<typeof upsertLibraryInputSchema>;

export const libraryEntrySchema = z.object({
  anime: animeSummarySchema,
  status: libraryStatusSchema,
  score: z.number().int().nullable(),
  progress: z.number().int(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const libraryQuerySchema = z.object({
  status: libraryStatusSchema.optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

export const librarySummarySchema = z.object({
  total: z.number().int(),
  byStatus: z.record(libraryStatusSchema, z.number().int()),
});
export type LibrarySummary = z.infer<typeof librarySummarySchema>;
