import type { Cosmetic, EarnedAchievement } from "@animeshadow/shared";
import { AVATAR_FRAMES, PROFILE_TITLES } from "@animeshadow/shared";

type Translate = (key: never, vars?: Record<string, string | number>) => string;

/** What opens a frame or a title, in words: "С 25 уровня", "За достижение «…»", "За поддержку проекта". */
export function requirementText(cosmetic: Cosmetic, t: Translate): string {
  if (cosmetic.pro) return "За поддержку проекта — PRO или донат";
  if (cosmetic.level != null) return `С ${cosmetic.level} уровня`;
  if (cosmetic.requires) {
    return `За достижение «${t(`achievements.items.${cosmetic.requires}.title` as never)}»`;
  }
  return "Есть у всех с первого дня";
}

/** The same, as a short tag on a locked swatch. */
export function requirementTag(cosmetic: Cosmetic): string | null {
  if (cosmetic.pro) return "PRO";
  if (cosmetic.level != null) return `${cosmetic.level} ур.`;
  return null;
}

/** How far toward a cosmetic: its level, or the achievement that opens it. */
export function requirementProgress(
  cosmetic: Cosmetic,
  level: number,
  achievements: EarnedAchievement[] | undefined,
): { current: number; target: number } | null {
  if (cosmetic.level != null) return { current: Math.min(level, cosmetic.level), target: cosmetic.level };
  if (cosmetic.requires) return achievements?.find((a) => a.id === cosmetic.requires)?.progress ?? null;
  return null;
}

export function frameCosmetic(id: string): Cosmetic | undefined {
  return (AVATAR_FRAMES as readonly Cosmetic[]).find((c) => c.id === id);
}

export function titleCosmetic(id: string): Cosmetic | undefined {
  return (PROFILE_TITLES as readonly Cosmetic[]).find((c) => c.id === id);
}
