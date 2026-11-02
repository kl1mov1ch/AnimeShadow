import type {
  Cosmetic,
  CosmeticContext,
  EarnedAchievement,
  MyProfile,
  PublicProfile,
} from "@animeshadow/shared";
import {
  AVATAR_FRAMES,
  PROFILE_TITLES,
  SHADOW_AVATAR_FRAMES,
} from "@animeshadow/shared";

type Translate = (key: never, vars?: Record<string, string | number>) => string;

/** What opens a frame or a title, in words: "С 25 уровня", "За достижение «…»", "За поддержку проекта". */
export function requirementText(cosmetic: Cosmetic, t: Translate): string {
  if (cosmetic.weeklyWatchTitlePlace)
    return `Занять ${cosmetic.weeklyWatchTitlePlace}-е место по итогам недели. Титул останется навсегда.`;
  if (cosmetic.weeklyWatch)
    return "Войти в топ-999 по итогам недели. Рамка выдаётся после подведения итогов и остаётся навсегда.";
  if (cosmetic.monthlyWatch)
    return "Войти в топ-999 по итогам календарного месяца. Рамка выдаётся после подведения итогов и остаётся навсегда.";
  if (cosmetic.watchAnime) {
    const frame = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === cosmetic.id);
    return frame?.requirementLabel.startsWith("Посмотреть")
      ? frame.requirementLabel
      : `Посмотреть ${cosmetic.watchAnime.episodesTotal === 1 ? "фильм" : "аниме"} «${frame?.name ?? "Аниме"}»`;
  }
  if (cosmetic.pro) return "За поддержку проекта — PRO или донат";
  if (cosmetic.level != null) return `С ${cosmetic.level} уровня`;
  if (cosmetic.requires) {
    return `За достижение «${t(`achievements.items.${cosmetic.requires}.title` as never)}»`;
  }
  return "Есть у всех с первого дня";
}

/** The same, as a short tag on a locked swatch. */
export function requirementTag(cosmetic: Cosmetic): string | null {
  if (cosmetic.weeklyWatchTitlePlace || cosmetic.weeklyWatch) return "Топ недели";
  if (cosmetic.monthlyWatch) return "Топ месяца";
  if (cosmetic.watchAnime)
    return cosmetic.watchAnime.episodesTotal === 1
      ? "За просмотр фильма"
      : "За просмотр аниме";
  if (cosmetic.pro) return "PRO";
  if (cosmetic.level != null) return `${cosmetic.level} ур.`;
  return null;
}

/** How far toward a cosmetic: its level, or the achievement that opens it. */
export function requirementProgress(
  cosmetic: Cosmetic,
  level: number,
  achievements: EarnedAchievement[] | undefined,
  context?: Pick<CosmeticContext, "animeQualifiedEpisodes">,
): { current: number; target: number } | null {
  if (cosmetic.watchAnime)
    return {
      current: Math.min(
        context?.animeQualifiedEpisodes?.[cosmetic.watchAnime.animeId] ?? 0,
        cosmetic.watchAnime.requiredEpisodes,
      ),
      target: cosmetic.watchAnime.requiredEpisodes,
    };
  if (cosmetic.level != null)
    return { current: Math.min(level, cosmetic.level), target: cosmetic.level };
  if (cosmetic.requires)
    return achievements?.find((a) => a.id === cosmetic.requires)?.progress ?? null;
  return null;
}

/** Only the owner's DTO carries playback time; public profiles expose awards. */
export function profileCosmeticContext(
  profile: PublicProfile,
  level = 1,
): CosmeticContext {
  const own = "frameWatchProgress" in profile ? (profile as MyProfile) : null;
  return {
    earnedIds: profile.achievements
      .filter((achievement) => achievement.earned)
      .map((achievement) => achievement.id),
    level,
    pro: profile.isPro,
    memberSince: profile.memberSince,
    weeklyWatchPlace: profile.weeklyWatchAward?.place,
    weeklyWatchPlaces: profile.weeklyWatchPlaces,
    monthlyWatchPlace: profile.monthlyWatchAward?.place,
    animeQualifiedEpisodes: Object.fromEntries(
      (own?.frameWatchProgress ?? []).map((progress) => [
        progress.animeId,
        progress.qualifiedEpisodes,
      ]),
    ),
  };
}

export function frameCosmetic(id: string): Cosmetic | undefined {
  return (AVATAR_FRAMES as readonly Cosmetic[]).find((c) => c.id === id);
}

/** Hours always precede minutes, including goals shorter than an hour. */
export function formatFrameWatchTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

export function titleCosmetic(id: string): Cosmetic | undefined {
  return (PROFILE_TITLES as readonly Cosmetic[]).find((c) => c.id === id);
}
