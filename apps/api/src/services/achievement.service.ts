import type { PrismaClient } from "@animeshadow/db";
import { ACHIEVEMENTS, type EarnedAchievement } from "@animeshadow/shared";

export interface AchievementServiceDeps {
  prisma: PrismaClient;
  proForAll?: boolean;
}

const EARLY_ADOPTER_CUTOFF = new Date("2027-03-01T00:00:00Z");
const EPISODE_SECONDS = 1440; // 24 min fallback when no session data

interface Snapshot {
  episodesWatched: number;
  totalHours: number;
  reviewCount: number;
  commentCount: number;
  anonCommentCount: number;
  plannedCount: number;
  completedSeries: number;
  completedLongSeries: number;
  topGenreEpisodes: number;
  episodesLast7Days: number;
  maxEpisodesInDay: number;
  hasNightActivity: boolean;
  maxStreakDays: number;
  createdAt: Date;
}

export class AchievementService {
  private readonly prisma: PrismaClient;
  private readonly proForAll: boolean;

  constructor(deps: AchievementServiceDeps) {
    this.prisma = deps.prisma;
    this.proForAll = deps.proForAll ?? false;
  }

  /** Idempotently grant every non-manual achievement the user now qualifies for. */
  async recompute(userId: string): Promise<string[]> {
    const snap = await this.snapshot(userId);
    const earned = await this.prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    });
    const have = new Set(earned.map((e) => e.achievementId));
    const toGrant: string[] = [];

    for (const def of ACHIEVEMENTS) {
      if (def.manual || have.has(def.id)) continue;
      if (this.evaluate(def.id, snap).earned) toGrant.push(def.id);
    }

    if (toGrant.length > 0) {
      await this.prisma.userAchievement.createMany({
        data: toGrant.map((achievementId) => ({ userId, achievementId })),
        skipDuplicates: true,
      });
    }
    return toGrant;
  }

  async list(userId: string): Promise<EarnedAchievement[]> {
    const [snap, earned] = await Promise.all([
      this.snapshot(userId),
      this.prisma.userAchievement.findMany({ where: { userId } }),
    ]);
    const earnedMap = new Map(earned.map((e) => [e.achievementId, e.earnedAt]));

    return ACHIEVEMENTS.map((def) => {
      const at = earnedMap.get(def.id);
      const proUnlocked =
        this.proForAll && (def.id === "supporter" || def.id === "first-donate");
      const evalResult = proUnlocked
        ? { earned: true, progress: null }
        : def.manual
          ? { earned: false, progress: null }
          : this.evaluate(def.id, snap);
      return {
        id: def.id,
        rarity: def.rarity,
        manual: def.manual ?? false,
        earned: at != null || evalResult.earned,
        earnedAt: at?.toISOString() ?? null,
        progress: at != null ? null : evalResult.progress,
      };
    });
  }

  // ---- internals ----

  private evaluate(
    id: string,
    s: Snapshot,
  ): { earned: boolean; progress: { current: number; target: number } | null } {
    const p = (current: number, target: number) => ({
      earned: current >= target,
      progress: current >= target ? null : { current: Math.floor(current), target },
    });
    switch (id) {
      case "first-episode":
        return p(s.episodesWatched, 1);
      case "first-review":
        return p(s.reviewCount, 1);
      case "first-series":
        return p(s.completedSeries, 1);
      case "fifty-episodes":
        return p(s.episodesWatched, 50);
      case "hundred-episodes":
        return p(s.episodesWatched, 100);
      case "hot-start":
        return p(s.maxEpisodesInDay, 10);
      case "night-owl":
        return { earned: s.hasNightActivity, progress: null };
      case "week-streak":
        return p(s.maxStreakDays, 7);
      case "critic":
        return p(s.commentCount, 50);
      case "anon-critic":
        return p(s.anonCommentCount, 50);
      case "marathoner":
        return p(s.episodesLast7Days, 100);
      case "genre-expert":
        return p(s.topGenreEpisodes, 50);
      case "bibliophile":
        return p(s.plannedCount, 100);
      case "completionist":
        return p(s.completedLongSeries, 1);
      case "early-adopter":
        return {
          earned: s.createdAt < EARLY_ADOPTER_CUTOFF,
          progress: null,
        };
      case "veteran":
        return p(s.totalHours, 1000);
      default:
        return { earned: false, progress: null };
    }
  }

  private async snapshot(userId: string): Promise<Snapshot> {
    const [
      completedProgress,
      sessionAgg,
      reviewCount,
      commentCount,
      anonCommentCount,
      plannedCount,
      completedEntries,
    ] = await Promise.all([
      this.prisma.watchProgress.findMany({
        where: { userId, completed: true },
        select: { animeId: true, updatedAt: true },
      }),
      this.prisma.watchSession.aggregate({
        where: { userId },
        _sum: { seconds: true },
      }),
      this.prisma.review.count({ where: { userId } }),
      this.prisma.comment.count({ where: { userId, deletedAt: null } }),
      this.prisma.comment.count({
        where: { userId, deletedAt: null, mode: "ANON" },
      }),
      this.prisma.libraryEntry.count({ where: { userId, status: "PLANNED" } }),
      this.prisma.libraryEntry.findMany({
        where: { userId, status: "COMPLETED" },
        select: { anime: { select: { episodes: true } } },
      }),
    ]);

    const episodesWatched = completedProgress.length;
    const sessionSeconds = sessionAgg._sum.seconds ?? 0;
    const totalHours =
      (sessionSeconds > 0 ? sessionSeconds : episodesWatched * EPISODE_SECONDS) /
      3600;

    // per-day + streak + last-7-days + night
    const dayCounts = new Map<string, number>();
    let hasNightActivity = false;
    const now = Date.now();
    let episodesLast7Days = 0;
    for (const row of completedProgress) {
      const d = row.updatedAt;
      const key = d.toISOString().slice(0, 10);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
      const hour = d.getUTCHours();
      if (hour >= 0 && hour < 5) hasNightActivity = true;
      if (now - d.getTime() <= 7 * 86_400_000) episodesLast7Days += 1;
    }
    const maxEpisodesInDay = dayCounts.size
      ? Math.max(...dayCounts.values())
      : 0;
    const maxStreakDays = longestStreak([...dayCounts.keys()]);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true },
    });

    const completedSeries = completedEntries.length;
    const completedLongSeries = completedEntries.filter(
      (e) => (e.anime.episodes ?? 0) >= 24,
    ).length;

    // top genre by completed episodes
    let topGenreEpisodes = 0;
    if (completedProgress.length > 0) {
      const links = await this.prisma.genreOnAnime.findMany({
        where: { animeId: { in: completedProgress.map((r) => r.animeId) } },
        select: { animeId: true, genreId: true },
      });
      const perAnime = new Map<number, number>();
      for (const r of completedProgress) {
        perAnime.set(r.animeId, (perAnime.get(r.animeId) ?? 0) + 1);
      }
      const perGenre = new Map<number, number>();
      for (const l of links) {
        perGenre.set(
          l.genreId,
          (perGenre.get(l.genreId) ?? 0) + (perAnime.get(l.animeId) ?? 0),
        );
      }
      topGenreEpisodes = perGenre.size ? Math.max(...perGenre.values()) : 0;
    }

    return {
      episodesWatched,
      totalHours,
      reviewCount,
      commentCount,
      anonCommentCount,
      plannedCount,
      completedSeries,
      completedLongSeries,
      topGenreEpisodes,
      episodesLast7Days,
      maxEpisodesInDay,
      hasNightActivity,
      maxStreakDays,
      createdAt: user.createdAt,
    };
  }
}

/** Longest run of consecutive calendar days in a set of YYYY-MM-DD strings. */
function longestStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = Date.parse(sorted[i - 1]!);
    const cur = Date.parse(sorted[i]!);
    if (cur - prev === 86_400_000) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}
