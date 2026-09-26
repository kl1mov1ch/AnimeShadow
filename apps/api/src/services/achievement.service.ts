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
  // Collections the user wrote, and what they got back.
  collections: number;
  collectionViews: number;
  ratingsReceived: number;
  ratingAverage: number;
  commentsReceived: number;
  // Collections of others the user read, rated, discussed.
  collectionsRated: number;
  collectionComments: number;
  collectionsRead: number;
  // Guess the anime.
  guessPlayed: number;
  guessBest: number;
  /** 1-based place on the board, null when not on it. */
  guessRank: number | null;
  /** The best needed to reach the 50th / 10th / 1st place right now. */
  guessNeed: { top50: number; top10: number; top1: number };
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
        category: def.category,
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
      case "five-hundred-episodes":
        return p(s.episodesWatched, 500);
      case "curator-first":
        return p(s.collections, 1);
      case "curator-trio":
        return p(s.collections, 3);
      case "curator-views":
        return p(s.collectionViews, 100);
      case "curator-famous":
        return p(s.collectionViews, 1000);
      case "curator-liked":
        return p(s.ratingsReceived, 25);
      case "curator-acclaimed":
        // Ten votes at least, and an average of 4.5 or better.
        return s.ratingAverage >= 4.5 || s.ratingsReceived < 10
          ? p(s.ratingsReceived, 10)
          : { earned: false, progress: { current: Math.round(s.ratingAverage * 10), target: 45 } };
      case "curator-talk":
        return p(s.commentsReceived, 50);
      case "collection-reader":
        return p(s.collectionsRead, 10);
      case "collection-judge":
        return p(s.collectionsRated, 20);
      case "discussant":
        return p(s.collectionComments, 20);
      case "guess-rookie":
        return p(s.guessPlayed, 25);
      case "guess-streak":
        return p(s.guessBest, 10);
      case "guess-sharp":
        return p(s.guessBest, 25);
      case "guess-top50":
        return s.guessRank != null && s.guessRank <= 50 ? p(1, 1) : p(s.guessBest, s.guessNeed.top50);
      case "guess-top10":
        return s.guessRank != null && s.guessRank <= 10 ? p(1, 1) : p(s.guessBest, s.guessNeed.top10);
      case "guess-champion":
        return s.guessRank === 1 ? p(1, 1) : p(s.guessBest, s.guessNeed.top1);
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
      authored,
      collectionsRated,
      collectionComments,
      collectionsRead,
      guess,
    ] = await Promise.all([
      this.prisma.watchProgress.findMany({
        where: { userId, completed: true },
        select: { animeId: true, updatedAt: true },
      }),
      this.prisma.watchSession.aggregate({
        where: { userId },
        _sum: { seconds: true },
      }),
      // "first-review" now means a personal score or note in your own list —
      // public reviews no longer exist.
      this.prisma.libraryEntry.count({
        where: { userId, OR: [{ score: { not: null } }, { notes: { not: null } }] },
      }),
      this.prisma.comment.count({ where: { userId, deletedAt: null } }),
      this.prisma.comment.count({
        where: { userId, deletedAt: null, mode: "ANON" },
      }),
      this.prisma.libraryEntry.count({ where: { userId, status: "PLANNED" } }),
      this.prisma.libraryEntry.findMany({
        where: { userId, status: "COMPLETED" },
        select: { anime: { select: { episodes: true } } },
      }),
      this.prisma.collection.aggregate({
        where: { userId },
        _count: true,
        _sum: { viewCount: true, ratingSum: true, ratingCount: true, commentCount: true },
      }),
      this.prisma.collectionRating.count({ where: { userId } }),
      this.prisma.collectionComment.count({ where: { userId, deletedAt: null } }),
      this.prisma.collectionView
        .groupBy({ by: ["collectionId"], where: { userId } })
        .then((rows) => rows.length),
      this.prisma.guessScore.findUnique({ where: { userId }, select: { best: true, played: true } }),
    ]);

    // Where the board stands: the best of the 50th, 10th and 1st of the
    // others — beat it and the place is yours.
    const guessBest = guess?.best ?? 0;
    const [guessRank, board] = await Promise.all([
      guessBest > 0
        ? this.prisma.guessScore.count({ where: { best: { gt: guessBest } } }).then((n) => n + 1)
        : Promise.resolve(null),
      this.prisma.guessScore.findMany({
        where: { best: { gt: 0 }, userId: { not: userId } },
        orderBy: [{ best: "desc" }, { bestAt: "asc" }],
        take: 50,
        select: { best: true },
      }),
    ]);
    const need = (place: number) => (board.length >= place ? board[place - 1]!.best + 1 : 1);
    const ratingCount = authored._sum.ratingCount ?? 0;

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
      collections: authored._count,
      collectionViews: authored._sum.viewCount ?? 0,
      ratingsReceived: ratingCount,
      ratingAverage: ratingCount > 0 ? (authored._sum.ratingSum ?? 0) / ratingCount : 0,
      commentsReceived: authored._sum.commentCount ?? 0,
      collectionsRated,
      collectionComments,
      collectionsRead,
      guessPlayed: guess?.played ?? 0,
      guessBest,
      guessRank,
      guessNeed: { top50: need(50), top10: need(10), top1: need(1) },
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
