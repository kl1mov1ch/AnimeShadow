import { z } from "zod";

export const achievementRaritySchema = z.enum([
  "common",
  "rare",
  "epic",
  "legendary",
]);
export type AchievementRarity = z.infer<typeof achievementRaritySchema>;

/** What kind of activity an achievement rewards — the profile groups by it. */
export const ACHIEVEMENT_CATEGORIES = ["watch", "curator", "community", "game", "special"] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export interface AchievementDef {
  id: string;
  rarity: AchievementRarity;
  category: AchievementCategory;
  /** Not auto-awarded — needs an external signal (payments, audio play, …). */
  manual?: boolean;
}

/**
 * The full achievement catalogue. Ids match the i18n keys
 * `achievements.items.<id>.title` / `.desc`. Auto-award logic lives in the API's
 * achievement service; `manual` ones are only granted by an explicit event.
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Watching
  { id: "first-episode", rarity: "common", category: "watch" },
  { id: "first-series", rarity: "common", category: "watch" },
  { id: "first-review", rarity: "common", category: "watch" },
  { id: "fifty-episodes", rarity: "rare", category: "watch" },
  { id: "hundred-episodes", rarity: "rare", category: "watch" },
  { id: "hot-start", rarity: "rare", category: "watch" },
  { id: "night-owl", rarity: "rare", category: "watch" },
  { id: "week-streak", rarity: "rare", category: "watch" },
  { id: "marathoner", rarity: "rare", category: "watch" },
  { id: "genre-expert", rarity: "epic", category: "watch" },
  { id: "bibliophile", rarity: "epic", category: "watch" },
  { id: "completionist", rarity: "epic", category: "watch" },
  { id: "five-hundred-episodes", rarity: "epic", category: "watch" },
  { id: "veteran", rarity: "legendary", category: "watch" },
  // Collections you write
  { id: "curator-first", rarity: "common", category: "curator" },
  { id: "curator-trio", rarity: "rare", category: "curator" },
  { id: "curator-views", rarity: "rare", category: "curator" },
  { id: "curator-liked", rarity: "rare", category: "curator" },
  { id: "curator-acclaimed", rarity: "epic", category: "curator" },
  { id: "curator-talk", rarity: "epic", category: "curator" },
  { id: "curator-famous", rarity: "legendary", category: "curator" },
  // Talking to others
  { id: "critic", rarity: "rare", category: "community" },
  { id: "anon-critic", rarity: "epic", category: "community" },
  { id: "collection-reader", rarity: "common", category: "community" },
  { id: "collection-judge", rarity: "rare", category: "community" },
  { id: "discussant", rarity: "rare", category: "community" },
  // Guess the anime
  { id: "guess-rookie", rarity: "common", category: "game" },
  { id: "guess-streak", rarity: "rare", category: "game" },
  { id: "guess-top50", rarity: "rare", category: "game" },
  { id: "guess-sharp", rarity: "epic", category: "game" },
  { id: "guess-top10", rarity: "epic", category: "game" },
  { id: "guess-champion", rarity: "legendary", category: "game" },
  // Special
  { id: "early-adopter", rarity: "epic", category: "special" },
  { id: "first-donate", rarity: "common", category: "special", manual: true },
  { id: "melomaniac", rarity: "rare", category: "special", manual: true },
  { id: "patron", rarity: "legendary", category: "special", manual: true },
  { id: "supporter", rarity: "legendary", category: "special", manual: true },
] as const;

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

export const earnedAchievementSchema = z.object({
  id: z.string(),
  rarity: achievementRaritySchema,
  category: z.enum(ACHIEVEMENT_CATEGORIES).default("special"),
  manual: z.boolean().default(false),
  earned: z.boolean(),
  earnedAt: z.string().nullable(),
  progress: z
    .object({ current: z.number().int(), target: z.number().int() })
    .nullable()
    .default(null),
});
export type EarnedAchievement = z.infer<typeof earnedAchievementSchema>;
