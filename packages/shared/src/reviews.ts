import { z } from "zod";

export const upsertReviewInputSchema = z.object({
  rating: z.number().int().min(1).max(10),
  body: z
    .string()
    .trim()
    .min(10, "Напишите хотя бы пару предложений")
    .max(4000, "Слишком длинный отзыв"),
});
export type UpsertReviewInput = z.infer<typeof upsertReviewInputSchema>;

export const reviewAuthorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});
export type ReviewAuthor = z.infer<typeof reviewAuthorSchema>;

export const reviewSchema = z.object({
  id: z.string(),
  animeId: z.number().int(),
  rating: z.number().int(),
  body: z.string(),
  author: reviewAuthorSchema,
  isMine: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const reviewSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  average: z.number().nullable(),
  /** rating value (1..10) -> how many reviews gave it */
  distribution: z.record(z.string(), z.number().int()),
});
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

export const reviewListSchema = z.object({
  items: z.array(reviewSchema),
  summary: reviewSummarySchema,
  mine: reviewSchema.nullable(),
});
export type ReviewList = z.infer<typeof reviewListSchema>;
