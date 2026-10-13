import { z } from "zod";
import { earnedAchievementSchema } from "./achievements.js";
import { animeSummarySchema } from "./anime.js";
import { libraryStatusSchema } from "./enums.js";

/** Max earned achievements a user can pin to their name at once. */
export const MAX_SHOWCASE_ACHIEVEMENTS = 3;


/**
 * Cosmetics are earned, never bought and never typed in.
 *
 * Both lists below name an achievement that unlocks the entry. `null` means
 * everyone has it from the start — there is always one of those in each
 * list, so a fresh account has something to pick rather than an empty grid.
 * The server re-checks the requirement on every save, so a key sent by hand
 * is worth no more than one clicked in the UI.
 */
export interface Cosmetic {
  id: string;
  /** Achievement id from ACHIEVEMENTS, or null for "everyone has this". */
  requires: string | null;
  /** Reached at this profile level (see levels.ts). */
  level?: number;
  /** For those who support the site (PRO / a donation). */
  pro?: boolean;
}

/** What an account has, for deciding what it may wear. */
export interface CosmeticContext {
  earnedIds: readonly string[];
  level: number;
  pro: boolean;
}

/** Rings drawn around the avatar. Ten, plus the bare one. */
export const AVATAR_FRAMES = [
  { id: "none", requires: null },
  { id: "sakura", requires: "first-episode" },
  { id: "ember", requires: "hot-start" },
  { id: "midnight", requires: "night-owl" },
  { id: "tide", requires: "fifty-episodes" },
  { id: "marathon", requires: "marathoner" },
  { id: "inkwell", requires: "critic" },
  { id: "archive", requires: "bibliophile" },
  { id: "spectrum", requires: "genre-expert" },
  { id: "eclipse", requires: "completionist" },
  { id: "aurum", requires: "veteran" },
  // The road of levels: a frame every few steps.
  { id: "spark", requires: null, level: 3 },
  { id: "jade", requires: null, level: 10 },
  { id: "amethyst", requires: null, level: 25 },
  { id: "inferno", requires: null, level: 50 },
  { id: "celestial", requires: null, level: 100 },
  { id: "sovereign", requires: null, level: 200 },
  // For those who support the site.
  { id: "aurora", requires: null, pro: true },
] as const satisfies readonly Cosmetic[];

export const AVATAR_FRAME_IDS = AVATAR_FRAMES.map((f) => f.id);
export const avatarFrameSchema = z.enum(
  AVATAR_FRAME_IDS as [string, ...string[]],
);
export type AvatarFrame = (typeof AVATAR_FRAMES)[number]["id"];

/**
 * The line under the name. It used to be free text for PRO accounts, which
 * meant the one thing on a profile nobody had earned was also the only one
 * anybody could write anything in. These are fixed, and each is a thing
 * that actually happened.
 */
export const PROFILE_TITLES = [
  { id: "newcomer", requires: null },
  { id: "first-steps", requires: "first-episode" },
  { id: "night-watch", requires: "night-owl" },
  { id: "serial-viewer", requires: "hundred-episodes" },
  { id: "marathoner", requires: "marathoner" },
  { id: "sharp-tongue", requires: "critic" },
  { id: "archivist", requires: "bibliophile" },
  { id: "genre-sage", requires: "genre-expert" },
  { id: "completionist", requires: "completionist" },
  { id: "old-guard", requires: "veteran" },
  { id: "patron", requires: "patron" },
  { id: "regular", requires: null, level: 15 },
  { id: "season-veteran", requires: null, level: 50 },
  { id: "shadow-lord", requires: null, level: 350 },
  { id: "benefactor", requires: null, pro: true },
  // Inviting friends
  { id: "guide", requires: "referral-guide" },
  { id: "spark-bearer", requires: "referral-spark" },
  { id: "ambassador", requires: "referral-ambassador" },
  { id: "community-legend", requires: "referral-legend" },
  { id: "star", requires: "referral-star" },
  // Secret achievements — the title is how others learn they exist
  { id: "secret-ghoul", requires: "secret-ghoul" },
  { id: "secret-shinigami", requires: "secret-shinigami" },
  { id: "secret-scout", requires: "secret-scout" },
  { id: "secret-hokage", requires: "secret-hokage" },
  { id: "secret-pirate", requires: "secret-pirate" },
  { id: "secret-alchemist", requires: "secret-alchemist" },
  { id: "secret-scientist", requires: "secret-scientist" },
  { id: "secret-hero", requires: "secret-hero" },
  { id: "secret-slayer", requires: "secret-slayer" },
  { id: "secret-sorcerer", requires: "secret-sorcerer" },
  { id: "secret-devil", requires: "secret-devil" },
  { id: "secret-pilot", requires: "secret-pilot" },
  { id: "secret-hunter", requires: "secret-hunter" },
  { id: "secret-spirit", requires: "secret-spirit" },
] as const satisfies readonly Cosmetic[];

export const PROFILE_TITLE_IDS = PROFILE_TITLES.map((t) => t.id);
export const profileTitleSchema = z.enum(
  PROFILE_TITLE_IDS as [string, ...string[]],
);
export type ProfileTitle = (typeof PROFILE_TITLES)[number]["id"];

/** Whether an account may wear `id`: its achievement, level and support all there. */
export function cosmeticUnlocked(
  catalog: readonly Cosmetic[],
  id: string,
  has: CosmeticContext | readonly string[],
): boolean {
  const ctx: CosmeticContext = Array.isArray(has) ? { earnedIds: has, level: 1, pro: false } : (has as CosmeticContext);
  const entry = catalog.find((c) => c.id === id) as Cosmetic | undefined;
  if (!entry) return false;
  if (entry.level != null && ctx.level < entry.level) return false;
  if (entry.pro && !ctx.pro) return false;
  return entry.requires == null || ctx.earnedIds.includes(entry.requires);
}

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
  /** One entry per day for the last two weeks, oldest first — the actual
   * watch history behind the totals above, so the profile can plot it. */
  dailyActivity: z.array(
    z.object({
      day: z.string(),
      minutes: z.number().int(),
      episodes: z.number().int(),
    }),
  ),
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

export const profileCountersSchema = z.object({
  /** Titles in the list with a score. */
  rated: z.number().int(),
  /** Titles in the list at all. */
  listed: z.number().int(),
  /** Comments still up. */
  comments: z.number().int(),
  followers: z.number().int(),
  /** Accounts that follow back. */
  friends: z.number().int(),
});
export type ProfileCounters = z.infer<typeof profileCountersSchema>;

/**
 * The profile's movable blocks. The header, the stats line and the
 * achievements stay put; these are what a viewer arranges.
 */
export const PROFILE_BLOCKS = [
  "showcase",
  "watching",
  "year",
  "activity",
  "compare",
] as const;
export const profileBlockSchema = z.enum(PROFILE_BLOCKS);
export type ProfileBlock = z.infer<typeof profileBlockSchema>;

export const profileLayoutSchema = z.object({
  order: z.array(profileBlockSchema),
  hidden: z.array(profileBlockSchema),
  /** Take the accent from the avatar instead of a picked colour. */
  autoAccent: z.boolean().default(false),
  /** How the progress bar under the name looks. */
  progressStyle: z
    .enum(["classic", "fire", "shadow", "sparks", "neon", "sakura", "ice"])
    .default("classic"),
  /** What that bar measures. */
  progressMetric: z.enum(["rank", "episodes", "titles", "achievements"]).default("rank"),
});
export type ProfileLayout = z.infer<typeof profileLayoutSchema>;

export const DEFAULT_PROFILE_LAYOUT: ProfileLayout = {
  order: [...PROFILE_BLOCKS],
  hidden: [],
  autoAccent: false,
  progressStyle: "classic",
  progressMetric: "rank",
};

/** Who may see one part of a profile. "users" means signed-in accounts. */
export const visibilitySchema = z.enum(["public", "users", "friends", "private"]);
export type Visibility = z.infer<typeof visibilitySchema>;

export const profilePrivacySchema = z.object({
  list: visibilitySchema,
  stats: visibilitySchema,
  activity: visibilitySchema,
  watching: visibilitySchema,
  /** The whole profile: hidden, a visitor sees only the name and the face. */
  profile: visibilitySchema.default("public"),
  /** Followers, following, friends — the counts and the lists. */
  social: visibilitySchema.default("public"),
  /** The favourite five. */
  favorites: visibilitySchema.default("public"),
  /** Achievements and the showcase. */
  achievements: visibilitySchema.default("public"),
  /** The wall: reading it and writing on it. */
  wall: visibilitySchema.default("public"),
  /** How many people have looked at the profile. */
  views: visibilitySchema.default("public"),
});
export type ProfilePrivacy = z.infer<typeof profilePrivacySchema>;

export const DEFAULT_PROFILE_PRIVACY: ProfilePrivacy = {
  list: "public",
  stats: "public",
  activity: "public",
  watching: "public",
  profile: "public",
  social: "public",
  favorites: "public",
  achievements: "public",
  wall: "public",
  views: "public",
};

/** Every part a privacy setting covers, in the order the settings show them. */
export const PRIVACY_PARTS = ["profile", "stats", "list", "watching", "activity", "favorites", "achievements", "social", "wall", "views"] as const;

export const publicProfileSchema = z.object({
  /** The account's id — what the profile's own sub-resources are keyed by,
   *  since a username is optional. */
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** The wide picture behind the profile header, uploaded or picked at random. */
  bannerUrl: z.string().nullable().default(null),
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
  /** Earned cosmetics. Null on both means "wearing nothing", which is a
   *  real choice and not the same as never having picked. */
  avatarFrame: avatarFrameSchema.nullable().default(null),
  profileTitle: profileTitleSchema.nullable().default(null),
  /** Likes received across every comment that's still visible (not deleted). */
  totalCommentLikes: z.number().int(),
  /** Experience granted by the site's admins, added to the level's own. */
  bonusXp: z.number().int().default(0),
  /** The numbers behind the endless tasks. Rated and listed are zero when
   *  the list is hidden from this viewer. */
  counters: profileCountersSchema.default({ rated: 0, listed: 0, comments: 0, followers: 0, friends: 0 }),
  /** Experience from the parts hidden from this viewer — one sum, so the
   *  level reads the same for everyone without showing what's behind it. */
  hiddenXp: z.number().int().default(0),
  /** 1-based standing among everyone who's ever posted a comment, by total
   * likes received — null for an account with no comments at all (nothing
   * to rank). */
  commenterRank: z.number().int().nullable(),
  /** How many accounts are in that ranking at all — the "of N" in "#4 of N". */
  totalRankedCommenters: z.number().int(),
  layout: profileLayoutSchema,
  /** The "my five" showcase, in the owner's order. */
  favorites: z.array(animeSummarySchema),
  /** What this viewer may not see — the blocks for these simply don't render. */
  hidden: z.object({
    list: z.boolean(),
    stats: z.boolean(),
    activity: z.boolean(),
    watching: z.boolean(),
    profile: z.boolean().default(false),
    social: z.boolean().default(false),
    favorites: z.boolean().default(false),
    achievements: z.boolean().default(false),
    wall: z.boolean().default(false),
    views: z.boolean().default(false),
  }),
  /** Profile views (unique people, once a day each); null when hidden. */
  views: z.number().int().nullable().default(null),
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
  privacy: profilePrivacySchema,
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
  avatarFrame: avatarFrameSchema.nullable().optional(),
  profileTitle: profileTitleSchema.nullable().optional(),
  layout: profileLayoutSchema.optional(),
  favoriteAnimeIds: z.array(z.number().int().positive()).max(5).optional(),
  privacy: profilePrivacySchema.optional(),
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

/** The same session from a visitor who isn't signed in, tied only to the
 *  random browser id the pageview beacon already uses. */
export const guestSessionInputSchema = logSessionInputSchema.extend({
  visitorId: z.string().min(8).max(64),
});
export type GuestSessionInput = z.infer<typeof guestSessionInputSchema>;

/** One day on the year heatmap. */
export const yearDaySchema = z.object({ day: z.string(), episodes: z.number().int() });

export const yearRecapSchema = z.object({
  year: z.number().int(),
  days: z.array(yearDaySchema),
  episodes: z.number().int(),
  hours: z.number(),
  titlesCompleted: z.number().int(),
  activeDays: z.number().int(),
  longestStreak: z.number().int(),
  busiestDay: yearDaySchema.nullable(),
  topGenre: z.string().nullable(),
});
export type YearRecap = z.infer<typeof yearRecapSchema>;

export const feedEventSchema = z.object({
  kind: z.enum(["completed", "episode", "rated", "added", "achievement"]),
  at: z.string(),
  anime: animeSummarySchema.nullable(),
  /** Episode number, score, or achievement id, depending on `kind`. */
  value: z.union([z.number(), z.string()]).nullable(),
});
export type FeedEvent = z.infer<typeof feedEventSchema>;

export const tasteCompareSchema = z.object({
  /** 0–100: how alike two lists are, from shared titles and their scores. */
  percent: z.number().int(),
  sharedCount: z.number().int(),
  common: z.array(
    z.object({
      anime: animeSummarySchema,
      mine: z.number().int().nullable(),
      theirs: z.number().int().nullable(),
    }),
  ),
  sharedGenres: z.array(z.string()),
});
export type TasteCompare = z.infer<typeof tasteCompareSchema>;

export const libraryImportInputSchema = z.object({
  format: z.enum(["mal", "shikimori", "animeshadow"]),
  content: z.string().min(1).max(5_000_000),
});
export type LibraryImportInput = z.infer<typeof libraryImportInputSchema>;
