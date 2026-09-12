import { z } from "zod";
import { earnedAchievementSchema } from "./achievements.js";
import { libraryStatusSchema } from "./enums.js";

/** Max earned achievements a user can pin to their name at once. */
export const MAX_SHOWCASE_ACHIEVEMENTS = 3;

export const rankSchema = z.enum(["NOVICE", "ADVANCED", "EXPERT", "LEGEND"]);
export type Rank = z.infer<typeof rankSchema>;

export const onlineStatusSchema = z.enum(["ONLINE", "OFFLINE", "DND"]);
export type OnlineStatus = z.infer<typeof onlineStatusSchema>;

/** Curated icon set for a PRO title — a fixed key, never a URL/free-form SVG. */
export const TITLE_ICONS = [
  "sword",
  "flame",
  "crown",
  "star",
  "heart",
  "skull",
  "ghost",
  "zap",
  "gem",
  "moon",
  "sparkles",
  "shield",
] as const;
export const titleIconSchema = z.enum(TITLE_ICONS);
export type TitleIcon = z.infer<typeof titleIconSchema>;

export const profileStatsSchema = z.object({
  episodesWatched: z.number().int(),
  hoursWatched: z.number(),
  titlesCompleted: z.number().int(),
  meanScore: z.number().nullable(),
  topGenres: z.array(z.object({ name: z.string(), count: z.number().int() })),
  mostProductiveDay: z.string().nullable(),
  avgSessionMinutes: z.number().nullable(),
});
export type ProfileStats = z.infer<typeof profileStatsSchema>;

export const publicProfileSchema = z.object({
  username: z.string().nullable(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  onlineStatus: onlineStatusSchema,
  rank: rankSchema,
  isPro: z.boolean(),
  memberSince: z.string(),
  stats: profileStatsSchema,
  achievements: z.array(earnedAchievementSchema),
  /** Up to MAX_SHOWCASE_ACHIEVEMENTS ids, order preserved (first = leftmost circle). */
  showcaseAchievementIds: z.array(z.string()),
  /** PRO-only custom title next to the name. Both null unless the account is PRO. */
  titlePrefix: z.string().nullable(),
  titleIcon: titleIconSchema.nullable(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const myProfileSchema = publicProfileSchema.extend({
  email: z.string(),
});
export type MyProfile = z.infer<typeof myProfileSchema>;

export const updateProfileInputSchema = z.object({
  bio: z.string().trim().max(500).nullable().optional(),
  onlineStatus: onlineStatusSchema.optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  showcaseAchievementIds: z.array(z.string()).max(MAX_SHOWCASE_ACHIEVEMENTS).optional(),
  titlePrefix: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .nullable()
    .optional(),
  titleIcon: titleIconSchema.nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const setUsernameInputSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3–20 chars: a–z, 0–9, _"),
});
export type SetUsernameInput = z.infer<typeof setUsernameInputSchema>;

export const progressDetailSchema = z.object({
  animeId: z.number().int(),
  slug: z.string(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  episode: z.number().int(),
  episodesTotal: z.number().int().nullable(),
  positionSeconds: z.number().int(),
  durationSeconds: z.number().int().nullable(),
  completed: z.boolean(),
  status: libraryStatusSchema.nullable(),
  totalSecondsOnTitle: z.number().int(),
  lastWatchedAt: z.string(),
});
export type ProgressDetail = z.infer<typeof progressDetailSchema>;

export const logSessionInputSchema = z.object({
  animeId: z.number().int().positive(),
  episode: z.number().int().positive().default(1),
  seconds: z.number().int().min(0).max(86_400),
  startedAt: z.string(),
});
export type LogSessionInput = z.infer<typeof logSessionInputSchema>;
