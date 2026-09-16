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
  /** Up to 3 titles from the list, highest personal score first — real
   * ratings only, never a title that hasn't actually been scored. */
  topRated: z.array(
    z.object({
      animeId: z.number().int(),
      slug: z.string(),
      title: z.string(),
      imageUrl: z.string().nullable(),
      score: z.number().int(),
    }),
  ),
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
  /** Likes received across every comment that's still visible (not deleted). */
  totalCommentLikes: z.number().int(),
  /** 1-based standing among everyone who's ever posted a comment, by total
   * likes received — null for an account with no comments at all (nothing
   * to rank). */
  commenterRank: z.number().int().nullable(),
  /** How many accounts are in that ranking at all — the "of N" in "#4 of N". */
  totalRankedCommenters: z.number().int(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

/** "light" | "dark" | "system" — mirrors next-themes' own values. */
export const themePreferenceSchema = z.enum(["light", "dark", "system"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const myProfileSchema = publicProfileSchema.extend({
  email: z.string(),
  /** Saved so the choice follows the account across devices, not just this browser. */
  theme: themePreferenceSchema.nullable(),
  /** Set once (see profile.service.ts) — the only basis for `isAdult`. Never
   * shown to anyone but the account owner. */
  birthDate: z.string().nullable(),
  /** Computed server-side from `birthDate` on every read — unlocks R+-rated
   * titles. Hentai stays excluded either way. */
  isAdult: z.boolean(),
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
  theme: themePreferenceSchema.nullable().optional(),
  showcaseAchievementIds: z.array(z.string()).max(MAX_SHOWCASE_ACHIEVEMENTS).optional(),
  titlePrefix: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .nullable()
    .optional(),
  titleIcon: titleIconSchema.nullable().optional(),
  /** YYYY-MM-DD. Accepted once — profile.service.ts rejects a second change. */
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
