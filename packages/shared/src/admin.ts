import { z } from "zod";
import type { AnimeSummary } from "./anime.js";
import { roleSchema } from "./auth.js";

const count = z.number().int().nonnegative();
const page = z.coerce.number().int().positive().default(1);
const perPage = z.coerce.number().int().positive().max(100).default(20);

// ---------------------------------------------------------------------------
// Overview — /admin/overview
// ---------------------------------------------------------------------------

/** A metric over the trailing 30 days next to the 30 days before it, so the
 * dashboard can show a trend without asking for a second window. */
export const adminKpiSchema = z.object({
  total: count,
  current: count,
  previous: count,
});
export type AdminKpi = z.infer<typeof adminKpiSchema>;

export const ADMIN_LIBRARY_STATUSES = [
  "WATCHING",
  "PLANNED",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
] as const;

export const adminOverviewSchema = z.object({
  kpis: z.object({
    users: adminKpiSchema,
    visitors: adminKpiSchema,
    pageviews: adminKpiSchema,
    watchSeconds: adminKpiSchema,
    comments: adminKpiSchema,
  }),
  /** One point per UTC day, oldest first, zero-filled — always 30 entries. */
  timeline: z.array(
    z.object({
      date: z.string(),
      pageviews: count,
      visitors: count,
      registrations: count,
      watchMinutes: count,
    }),
  ),
  /** Pageviews by UTC hour over the last 7 days — always 24 entries. */
  hourly: z.array(z.object({ hour: z.number().int().min(0).max(23), pageviews: count })),
  audience: z.object({
    total: count,
    admins: count,
    banned: count,
    telegram: count,
    activeToday: count,
  }),
  topReferrers: z.array(z.object({ host: z.string(), count })),
  topPaths: z.array(z.object({ path: z.string(), count })),
  libraryStatus: z.array(z.object({ status: z.enum(ADMIN_LIBRARY_STATUSES), count })),
  topGenres: z.array(z.object({ name: z.string(), count })),
  topAnime: z.array(
    z.object({ anime: z.custom<AnimeSummary>(), views: count, watchers: count }),
  ),
  recentUsers: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      avatarUrl: z.string().nullable(),
      hasTelegram: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  recentComments: z.array(
    z.object({
      id: z.string(),
      animeId: z.number().int(),
      animeTitle: z.string(),
      authorName: z.string(),
      authorAvatarUrl: z.string().nullable(),
      body: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

// ---------------------------------------------------------------------------
// Users — /admin/users
// ---------------------------------------------------------------------------

export const adminUserQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  role: z.enum(["all", "USER", "ADMIN"]).default("all"),
  status: z.enum(["all", "active", "banned"]).default("all"),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
  page,
  perPage,
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: roleSchema,
  isBanned: z.boolean(),
  hasTelegram: z.boolean(),
  commentCount: count,
  libraryCount: count,
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
// Comments — /admin/comments
// ---------------------------------------------------------------------------

export const adminCommentQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  animeId: z.coerce.number().int().positive().optional(),
  status: z.enum(["all", "active", "deleted"]).default("all"),
  sort: z.enum(["newest", "oldest", "top"]).default("newest"),
  page,
  perPage,
});
export type AdminCommentQuery = z.infer<typeof adminCommentQuerySchema>;

export const adminCommentSummarySchema = z.object({
  id: z.string(),
  animeId: z.number().int(),
  animeSlug: z.string(),
  animeTitle: z.string(),
  animeImageUrl: z.string().nullable(),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string().nullable(),
  body: z.string(),
  mode: z.string(),
  likeCount: count,
  dislikeCount: count,
  deleted: z.boolean(),
  createdAt: z.string(),
});
export type AdminCommentSummary = z.infer<typeof adminCommentSummarySchema>;
