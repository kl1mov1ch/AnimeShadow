import { z } from "zod";
import { roleSchema } from "./auth.js";

// ---------------------------------------------------------------------------
// Overview — /admin/overview
// ---------------------------------------------------------------------------

export const adminOverviewSchema = z.object({
  users: z.object({
    total: z.number().int().nonnegative(),
    admins: z.number().int().nonnegative(),
    newToday: z.number().int().nonnegative(),
    new7d: z.number().int().nonnegative(),
    new30d: z.number().int().nonnegative(),
  }),
  topReferrers: z.array(
    z.object({ host: z.string(), count: z.number().int().nonnegative() }),
  ),
  traffic: z.object({
    pageviewsToday: z.number().int().nonnegative(),
    pageviews7d: z.number().int().nonnegative(),
    pageviews30d: z.number().int().nonnegative(),
    uniqueVisitors7d: z.number().int().nonnegative(),
    topPaths: z.array(
      z.object({ path: z.string(), count: z.number().int().nonnegative() }),
    ),
  }),
  topAnime: z.array(
    z.object({
      id: z.number().int(),
      slug: z.string(),
      title: z.string(),
      viewCount: z.number().int().nonnegative(),
    }),
  ),
  watch: z.object({
    totalSeconds: z.number().int().nonnegative(),
    sessionCount: z.number().int().nonnegative(),
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

// ---------------------------------------------------------------------------
// Users — /admin/users
// ---------------------------------------------------------------------------

export const adminUserQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: roleSchema,
  isBanned: z.boolean(),
  hasTelegram: z.boolean(),
  createdAt: z.string(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUpdateUserInputSchema = z
  .object({
    role: roleSchema.optional(),
    isBanned: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.isBanned !== undefined, {
    message: "Nothing to update",
  });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserInputSchema>;

// ---------------------------------------------------------------------------
// Comments & reviews — /admin/comments, /admin/reviews
// ---------------------------------------------------------------------------

export const adminContentQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  animeId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});
export type AdminContentQuery = z.infer<typeof adminContentQuerySchema>;

export const adminCommentSummarySchema = z.object({
  id: z.string(),
  animeId: z.number().int(),
  animeTitle: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  body: z.string(),
  mode: z.string(),
  deleted: z.boolean(),
  createdAt: z.string(),
});
export type AdminCommentSummary = z.infer<typeof adminCommentSummarySchema>;

export const adminReviewSummarySchema = z.object({
  id: z.string(),
  animeId: z.number().int(),
  animeTitle: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  rating: z.number().int(),
  body: z.string(),
  createdAt: z.string(),
});
export type AdminReviewSummary = z.infer<typeof adminReviewSummarySchema>;
