import type { AchievementRarity, PublicProfile } from "@animeshadow/shared";

/**
 * The profile's level: experience earned for what the account actually did
 * on the site — episodes, finished titles, achievements by rarity, likes on
 * comments — and for building the profile itself (an avatar, a cover, a
 * bio, a top five). Everything comes from the profile the page already has,
 * so it costs nothing to compute and reads the same for the owner and for
 * a visitor: a level is something to show off.
 */

export interface XpSource {
  key: string;
  label: string;
  /** What one unit is worth. */
  each: number;
  count: number;
  xp: number;
  /** The unit, for "×N серий". */
  unit: string;
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** Experience at the start of this level and at the start of the next. */
  floor: number;
  ceiling: number;
  /** 0…1 of the way to the next level. */
  progress: number;
  tier: LevelTier;
  sources: XpSource[];
}

export interface LevelTier {
  from: number;
  name: string;
  /** Colours for the badge: ring/gradient start and end. */
  from_color: string;
  to_color: string;
}

/** Names by level band — what the badge says beside the number. */
export const LEVEL_TIERS: LevelTier[] = [
  { from: 1, name: "Зритель", from_color: "#94a3b8", to_color: "#64748b" },
  { from: 5, name: "Знаток", from_color: "#34d399", to_color: "#059669" },
  { from: 10, name: "Отаку", from_color: "#38bdf8", to_color: "#2563eb" },
  { from: 18, name: "Сэмпай", from_color: "#a78bfa", to_color: "#7c3aed" },
  { from: 28, name: "Сэнсэй", from_color: "#fb7185", to_color: "#e11d48" },
  { from: 40, name: "Легенда", from_color: "#fbbf24", to_color: "#f97316" },
];

const RARITY_XP: Record<AchievementRarity, number> = { common: 25, rare: 60, epic: 120, legendary: 300 };

/** Experience needed to reach `level` (level 1 at 0, 2 at 100, 3 at 300, 4 at 600 …). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function tierFor(level: number): LevelTier {
  return [...LEVEL_TIERS].reverse().find((t) => level >= t.from) ?? LEVEL_TIERS[0]!;
}

export function levelOf(profile: PublicProfile): LevelInfo {
  const earned = profile.achievements.filter((a) => a.earned);
  const byRarity = (r: AchievementRarity) => earned.filter((a) => a.rarity === r).length;
  const raw: Array<Omit<XpSource, "xp">> = [
    { key: "episodes", label: "Просмотренные серии", each: 10, count: profile.stats.episodesWatched, unit: plural(profile.stats.episodesWatched, "серия", "серии", "серий") },
    { key: "titles", label: "Досмотренные тайтлы", each: 60, count: profile.stats.titlesCompleted, unit: plural(profile.stats.titlesCompleted, "тайтл", "тайтла", "тайтлов") },
    { key: "legendary", label: "Легендарные достижения", each: RARITY_XP.legendary, count: byRarity("legendary"), unit: "шт." },
    { key: "epic", label: "Эпические достижения", each: RARITY_XP.epic, count: byRarity("epic"), unit: "шт." },
    { key: "rare", label: "Редкие достижения", each: RARITY_XP.rare, count: byRarity("rare"), unit: "шт." },
    { key: "common", label: "Обычные достижения", each: RARITY_XP.common, count: byRarity("common"), unit: "шт." },
    { key: "likes", label: "Лайки на комментариях", each: 4, count: profile.totalCommentLikes, unit: plural(profile.totalCommentLikes, "лайк", "лайка", "лайков") },
    { key: "favorites", label: "Тайтлы в «Моей пятёрке»", each: 15, count: profile.favorites.length, unit: "из 5" },
    { key: "pins", label: "Достижения на витрине", each: 10, count: profile.showcaseAchievementIds.length, unit: "шт." },
    { key: "avatar", label: "Свой аватар", each: 30, count: profile.avatarUrl ? 1 : 0, unit: "" },
    { key: "banner", label: "Своя обложка", each: 30, count: profile.bannerUrl ? 1 : 0, unit: "" },
    { key: "bio", label: "Рассказ о себе", each: 20, count: profile.bio ? 1 : 0, unit: "" },
  ];
  const sources = raw.map((s) => ({ ...s, xp: s.each * s.count }));
  const xp = sources.reduce((sum, s) => sum + s.xp, 0);
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 99) level += 1;
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  return {
    level,
    xp,
    floor,
    ceiling,
    progress: Math.min(1, (xp - floor) / Math.max(1, ceiling - floor)),
    tier: tierFor(level),
    sources,
  };
}

/** Scrolls to a block of the profile, below the sticky header and the section row. */
export function jumpTo(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
}

/** "1 серия", "3 серии", "7 серий". */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
