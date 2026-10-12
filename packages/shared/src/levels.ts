import type { AchievementRarity } from "./achievements.js";
import type { PublicProfile } from "./profile.js";
import { questStates } from "./quests.js";

/**
 * The profile level — one formula for the page and the server (the server
 * checks it before letting a level-locked frame be worn).
 *
 * Experience comes from what the account did — episodes, finished titles,
 * achievements by rarity, likes on comments — from building the profile (an
 * avatar, a cover, a bio, a top five, a showcase), and from what the site's
 * admins granted. Each next level costs a little more than the last
 * (30 × level^1.45): the first levels come in minutes, the hundredth takes
 * a long, devoted while.
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

/** A band of levels: its name, colours and grade (how dressed-up its badge is, 0…11). */
export interface LevelTier {
  from: number;
  name: string;
  /** Light → mid → deep. */
  colors: [string, string, string];
  /** The halo, rgba. */
  glow: string;
  grade: number;
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
  /** The band after this one, if any. */
  nextTier: LevelTier | null;
  sources: XpSource[];
}

export const MAX_LEVEL = 1000;

export const LEVEL_TIERS: LevelTier[] = [
  { from: 1, name: "Зритель", colors: ["#e2e8f0", "#94a3b8", "#475569"], glow: "rgba(148,163,184,0.35)", grade: 0 },
  { from: 5, name: "Знаток", colors: ["#a7f3d0", "#34d399", "#047857"], glow: "rgba(52,211,153,0.4)", grade: 1 },
  { from: 10, name: "Отаку", colors: ["#bae6fd", "#38bdf8", "#1d4ed8"], glow: "rgba(56,189,248,0.45)", grade: 2 },
  { from: 18, name: "Сэмпай", colors: ["#ddd6fe", "#a78bfa", "#6d28d9"], glow: "rgba(167,139,250,0.5)", grade: 3 },
  { from: 28, name: "Сэнсэй", colors: ["#fecdd3", "#fb7185", "#be123c"], glow: "rgba(251,113,133,0.5)", grade: 4 },
  { from: 40, name: "Легенда", colors: ["#fef3c7", "#fbbf24", "#c2410c"], glow: "rgba(251,191,36,0.55)", grade: 5 },
  { from: 60, name: "Мифический", colors: ["#f5d0fe", "#e879f9", "#0891b2"], glow: "rgba(232,121,249,0.55)", grade: 6 },
  { from: 100, name: "Бессмертный", colors: ["#fef08a", "#f97316", "#b91c1c"], glow: "rgba(249,115,22,0.6)", grade: 7 },
  { from: 200, name: "Небожитель", colors: ["#f0f9ff", "#93c5fd", "#4f46e5"], glow: "rgba(147,197,253,0.6)", grade: 8 },
  { from: 350, name: "Владыка теней", colors: ["#fda4af", "#e11d48", "#1e1b4b"], glow: "rgba(225,29,72,0.6)", grade: 9 },
  { from: 500, name: "Абсолют", colors: ["#ffffff", "#fde047", "#d97706"], glow: "rgba(253,224,71,0.65)", grade: 10 },
  { from: 700, name: "Сёгун теней", colors: ["#ffe4e6", "#ff4d6d", "#6d28d9"], glow: "rgba(255,77,109,0.7)", grade: 11 },
];

/** Experience to reach each level: XP_AT[level]. */
const XP_AT: number[] = (() => {
  const table = [0, 0];
  for (let level = 1; level < MAX_LEVEL; level += 1) table.push(table[level]! + Math.round(30 * level ** 1.45));
  return table;
})();

/** Experience needed to reach `level`. */
export function xpForLevel(level: number): number {
  return XP_AT[Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))]!;
}

/** The level a given amount of experience reaches. */
export function levelForXp(xp: number): number {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (XP_AT[mid]! <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function tierFor(level: number): LevelTier {
  return [...LEVEL_TIERS].reverse().find((t) => level >= t.from) ?? LEVEL_TIERS[0]!;
}

const RARITY_XP: Record<AchievementRarity, number> = { common: 25, rare: 60, epic: 120, legendary: 300 };

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

type LevelInput = Pick<
  PublicProfile,
  | "achievements"
  | "stats"
  | "totalCommentLikes"
  | "favorites"
  | "showcaseAchievementIds"
  | "avatarUrl"
  | "bannerUrl"
  | "bio"
  | "bonusXp"
  | "counters"
  | "hiddenXp"
>;

/** The experience an account earned itself, without what was granted. */
export function earnedSources(profile: LevelInput): XpSource[] {
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
  // Stages of the endless tasks: each pays its own amount, so the source
  // carries the sum rather than "each × count".
  const quests = questStates(profile);
  const stages = quests.reduce((sum, q) => sum + q.done, 0);
  if (stages > 0) {
    const xp = quests.reduce((sum, q) => sum + q.earned, 0);
    sources.push({ key: "quests", label: "Этапы заданий", each: Math.round(xp / stages), count: stages, unit: plural(stages, "этап", "этапа", "этапов"), xp });
  }
  return sources;
}

export function levelOf(profile: LevelInput): LevelInfo {
  const sources = earnedSources(profile);
  const bonus = profile.bonusXp ?? 0;
  const hidden = profile.hiddenXp ?? 0;
  if (hidden > 0) {
    sources.push({ key: "hidden", label: "Скрытая активность", each: 1, count: hidden, unit: "опыта", xp: hidden });
  }
  if (bonus > 0) {
    sources.unshift({ key: "bonus", label: "Награда от AnimeShadow", each: 1, count: bonus, unit: "опыта", xp: bonus });
  }
  const xp = sources.reduce((sum, s) => sum + s.xp, 0);
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(Math.min(MAX_LEVEL, level + 1));
  return {
    level,
    xp,
    floor,
    ceiling,
    progress: level >= MAX_LEVEL ? 1 : Math.min(1, (xp - floor) / Math.max(1, ceiling - floor)),
    tier: tierFor(level),
    nextTier: LEVEL_TIERS.find((t) => t.from > level) ?? null,
    sources,
  };
}
