import type { PublicProfile } from "./profile.js";

/**
 * Tasks that never run out. Each has a ladder of goals — 10 episodes, then
 * 25, 50, 100… — and past the last listed goal it keeps going in even
 * steps, so there is always a next stage. Reaching a goal opens the next one
 * at once and pays experience; each stage pays a little more than the last.
 *
 * Everything is derived from what the profile already counts, so the page
 * and the server agree without storing anything.
 */

export type QuestKey =
  | "watch"
  | "finish"
  | "rate"
  | "collect"
  | "talk"
  | "liked"
  | "friends"
  | "followers"
  | "trophies";

export type QuestInput = Pick<PublicProfile, "stats" | "counters" | "achievements" | "totalCommentLikes">;

export interface QuestDef {
  key: QuestKey;
  title: string;
  /** "Посмотрите 100 серий" — the goal of a stage, worded for its number. */
  goal: (n: number) => string;
  value: (p: QuestInput) => number;
  /** The first goals, in order. */
  steps: number[];
  /** Past the listed goals, each next one adds this much. */
  then: number;
  /** A ladder that can end: no goal beyond this. */
  cap?: (p: QuestInput) => number;
  /** What the first stage pays; each next one pays half of it more. */
  xp: number;
}

export interface QuestState {
  def: QuestDef;
  /** Stages passed so far. */
  done: number;
  value: number;
  /** The goal of the stage being worked on now, and the one before it. */
  target: number | null;
  from: number;
  /** What the stage being worked on pays. */
  reward: number;
  /** Experience already paid by the passed stages. */
  earned: number;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const n = (v: number) => v.toLocaleString("ru-RU");

export const QUESTS: QuestDef[] = [
  {
    key: "watch",
    title: "Марафонец",
    goal: (v) => `Посмотрите ${n(v)} ${plural(v, "серию", "серии", "серий")}`,
    value: (p) => p.stats.episodesWatched,
    steps: [10, 25, 50, 100, 200, 350, 500, 750, 1000],
    then: 500,
    xp: 40,
  },
  {
    key: "finish",
    title: "Финишёр",
    goal: (v) => `Досмотрите ${n(v)} ${plural(v, "тайтл", "тайтла", "тайтлов")} до конца`,
    value: (p) => p.stats.titlesCompleted,
    steps: [1, 3, 5, 10, 20, 35, 50, 75, 100],
    then: 50,
    xp: 50,
  },
  {
    key: "rate",
    title: "Критик",
    goal: (v) => `Поставьте оценку ${n(v)} ${plural(v, "тайтлу", "тайтлам", "тайтлам")}`,
    value: (p) => p.counters.rated,
    steps: [3, 10, 25, 50, 100, 150, 200, 300],
    then: 100,
    xp: 30,
  },
  {
    key: "collect",
    title: "Коллекционер",
    goal: (v) => `Добавьте в свои списки ${n(v)} ${plural(v, "тайтл", "тайтла", "тайтлов")}`,
    value: (p) => p.counters.listed,
    steps: [5, 15, 30, 60, 100, 150, 250],
    then: 100,
    xp: 25,
  },
  {
    key: "talk",
    title: "Собеседник",
    goal: (v) => `Напишите ${n(v)} ${plural(v, "комментарий", "комментария", "комментариев")}`,
    value: (p) => p.counters.comments,
    steps: [1, 5, 15, 30, 60, 100],
    then: 50,
    xp: 25,
  },
  {
    key: "liked",
    title: "Голос сообщества",
    goal: (v) => `Соберите ${n(v)} ${plural(v, "лайк", "лайка", "лайков")} на комментариях`,
    value: (p) => p.totalCommentLikes,
    steps: [1, 5, 15, 30, 60, 100, 200],
    then: 100,
    xp: 40,
  },
  {
    key: "friends",
    title: "Свои люди",
    goal: (v) => `Заведите ${n(v)} ${plural(v, "друга", "друзей", "друзей")}`,
    value: (p) => p.counters.friends,
    steps: [1, 3, 5, 10, 20, 35, 50],
    then: 25,
    xp: 50,
  },
  {
    key: "followers",
    title: "Популярность",
    goal: (v) => `Соберите ${n(v)} ${plural(v, "подписчика", "подписчиков", "подписчиков")}`,
    value: (p) => p.counters.followers,
    steps: [1, 5, 10, 25, 50, 100, 250],
    then: 250,
    xp: 40,
  },
  {
    key: "trophies",
    title: "Охотник за трофеями",
    goal: (v) => `Получите ${n(v)} ${plural(v, "достижение", "достижения", "достижений")}`,
    value: (p) => p.achievements.filter((a) => a.earned).length,
    steps: [1, 3, 5, 10, 15, 20, 25, 30, 40],
    then: 10,
    cap: (p) => p.achievements.length,
    xp: 60,
  },
];

/** The goal of stage `i` (0-based) on the open ladder. */
function rawGoal(def: QuestDef, i: number): number {
  if (i < def.steps.length) return def.steps[i]!;
  return def.steps[def.steps.length - 1]! + def.then * (i - def.steps.length + 1);
}

/** The goal of stage `i`, or null past the end. A capped ladder ends on the
 *  cap itself rather than on a goal no one could reach. */
function goalAt(def: QuestDef, i: number, cap: number): number | null {
  if (cap <= 0) return null;
  const goal = rawGoal(def, i);
  if (goal < cap) return goal;
  return i === 0 || rawGoal(def, i - 1) < cap ? cap : null;
}

/** What stage `i` (0-based) pays. */
export function questReward(def: QuestDef, i: number): number {
  return Math.round(def.xp * (1 + 0.5 * i));
}

export function questState(def: QuestDef, p: QuestInput): QuestState {
  const value = Math.max(0, def.value(p));
  const cap = def.cap?.(p) ?? Infinity;
  let done = 0;
  let earned = 0;
  for (;;) {
    const goal = goalAt(def, done, cap);
    if (goal === null || goal > value || done >= 10_000) break;
    earned += questReward(def, done);
    done += 1;
  }
  return {
    def,
    done,
    value,
    target: goalAt(def, done, cap),
    from: done > 0 ? (goalAt(def, done - 1, cap) ?? 0) : 0,
    reward: questReward(def, done),
    earned,
  };
}

export function questStates(p: QuestInput): QuestState[] {
  return QUESTS.map((def) => questState(def, p));
}
