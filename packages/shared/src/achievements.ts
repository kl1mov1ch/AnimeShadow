import { z } from "zod";

export const achievementRaritySchema = z.enum([
  "common",
  "rare",
  "epic",
  "legendary",
]);
export type AchievementRarity = z.infer<typeof achievementRaritySchema>;

export interface AchievementDef {
  id: string;
  rarity: AchievementRarity;
  /** Not auto-awarded — needs an external signal (payments, audio play, …). */
  manual?: boolean;
}

/**
 * The full achievement catalogue. Ids match the i18n keys
 * `achievements.items.<id>.title` / `.desc`. Auto-award logic lives in the API's
 * achievement service; `manual` ones are only granted by an explicit event.
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "first-episode", rarity: "common" },
  { id: "first-review", rarity: "common" },
  { id: "first-series", rarity: "common" },
  { id: "first-donate", rarity: "common", manual: true },
  { id: "fifty-episodes", rarity: "rare" },
  { id: "hundred-episodes", rarity: "rare" },
  { id: "hot-start", rarity: "rare" },
  { id: "night-owl", rarity: "rare" },
  { id: "week-streak", rarity: "rare" },
  { id: "critic", rarity: "rare" },
  { id: "marathoner", rarity: "rare" },
  { id: "melomaniac", rarity: "rare", manual: true },
  { id: "genre-expert", rarity: "epic" },
  { id: "bibliophile", rarity: "epic" },
  { id: "anon-critic", rarity: "epic" },
  { id: "completionist", rarity: "epic" },
  { id: "early-adopter", rarity: "epic" },
  { id: "veteran", rarity: "legendary" },
  { id: "patron", rarity: "legendary", manual: true },
  { id: "supporter", rarity: "legendary", manual: true },
] as const;

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

export const earnedAchievementSchema = z.object({
  id: z.string(),
  rarity: achievementRaritySchema,
  manual: z.boolean().default(false),
  earned: z.boolean(),
  earnedAt: z.string().nullable(),
  progress: z
    .object({ current: z.number().int(), target: z.number().int() })
    .nullable()
    .default(null),
});
export type EarnedAchievement = z.infer<typeof earnedAchievementSchema>;
