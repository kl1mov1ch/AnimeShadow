import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@animeshadow/db";
import type {
  MyProfile,
  ProfileStats,
  ProgressDetail,
  PublicProfile,
  Rank,
  UpdateProfileInput,
} from "@animeshadow/shared";
import { MAX_SHOWCASE_ACHIEVEMENTS } from "@animeshadow/shared";
import { computeIsAdult } from "../lib/content-guard.js";
import { watchSecondsTotal, watchSessionsTotal } from "../lib/metrics.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UpstreamUnavailableError,
} from "../lib/errors.js";
import { isProfane } from "../lib/profanity.js";
import { fetchReactionGif, randomReactionCategory } from "../lib/reaction-gif.js";
import { TtlCache } from "../lib/cache.js";
import type { AchievementService } from "./achievement.service.js";

export interface ProfileServiceDeps {
  prisma: PrismaClient;
  achievements: AchievementService;
  uploadsDir: string;
  proForAll?: boolean;
}

const EPISODE_SECONDS = 1440;
// "Continue watching" on the profile — most-recently-touched titles only,
// not an ever-growing list of every title ever started.
const PROGRESS_ANIME_LIMIT = 10;

function rankOf(hours: number): Rank {
  if (hours >= 500) return "LEGEND";
  if (hours >= 100) return "EXPERT";
  if (hours >= 10) return "ADVANCED";
  return "NOVICE";
}

export class ProfileService {
  private readonly prisma: PrismaClient;
  private readonly achievements: AchievementService;
  private readonly uploadsDir: string;
  private readonly proForAll: boolean;
  // Recomputing "everyone's total comment likes, ranked" is one groupBy over
  // the whole Comment table — cheap at this site's scale, but there's no
  // reason to pay it again for every profile view in the same few minutes.
  // Single entry (the key is constant), so this is really just a TTL box
  // around one value.
  private readonly commenterLeaderboard = new TtlCache<
    Array<{ userId: string; total: number }>
  >(5 * 60_000, 1);

  constructor(deps: ProfileServiceDeps) {
    this.prisma = deps.prisma;
    this.achievements = deps.achievements;
    this.uploadsDir = deps.uploadsDir;
    this.proForAll = deps.proForAll ?? false;
  }

  async getByUsername(username: string): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundError("Профиль не найден.");
    return this.build(user.id);
  }

  /** By id rather than username — comment authors don't all have one set,
   * but every one of them should still be clickable through to a profile. */
  async getById(userId: string): Promise<PublicProfile> {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError("Профиль не найден.");
    return this.build(userId);
  }

  async getMine(userId: string): Promise<MyProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const base = await this.build(userId);
    const theme =
      user.theme === "light" || user.theme === "dark" || user.theme === "system"
        ? user.theme
        : null;
    return {
      ...base,
      email: user.email,
      theme,
      birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
      isAdult: computeIsAdult(user.birthDate),
    };
  }

  async update(userId: string, input: UpdateProfileInput): Promise<MyProfile> {
    if (input.showcaseAchievementIds !== undefined) {
      if (input.showcaseAchievementIds.length > MAX_SHOWCASE_ACHIEVEMENTS) {
        throw new BadRequestError(`Можно закрепить не больше ${MAX_SHOWCASE_ACHIEVEMENTS} ачивок.`);
      }
      const earned = await this.achievements.list(userId);
      const earnedIds = new Set(earned.filter((a) => a.earned).map((a) => a.id));
      const allOwned = input.showcaseAchievementIds.every((id) => earnedIds.has(id));
      if (!allOwned) throw new BadRequestError("Эта ачивка вам недоступна.");
    }

    if (input.titlePrefix !== undefined || input.titleIcon !== undefined) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { proSince: true },
      });
      if (user.proSince == null) {
        throw new BadRequestError("Свой значок и подпись доступны только с PRO.");
      }
      if (input.titlePrefix && isProfane(input.titlePrefix)) {
        throw new BadRequestError("Недопустимый текст в подписи.");
      }
    }

    let birthDate: Date | undefined;
    if (input.birthDate !== undefined) {
      const existing = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { birthDate: true },
      });
      // Set once — a self-reported date is only meaningful as a one-time
      // confirmation, not a dial a lapsed adult could flip back and forth.
      if (existing.birthDate != null) {
        throw new BadRequestError("Дата рождения уже подтверждена.");
      }
      const parsed = new Date(`${input.birthDate}T00:00:00.000Z`);
      const now = Date.now();
      const minDate = new Date(now - 120 * 365.25 * 86_400_000);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now || parsed < minDate) {
        throw new BadRequestError("Некорректная дата рождения.");
      }
      birthDate = parsed;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.onlineStatus ? { onlineStatus: input.onlineStatus } : {}),
        ...(input.accentColor !== undefined
          ? { accentColor: input.accentColor }
          : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.showcaseAchievementIds !== undefined
          ? { showcaseAchievementIds: input.showcaseAchievementIds }
          : {}),
        ...(input.titlePrefix !== undefined ? { titlePrefix: input.titlePrefix } : {}),
        ...(input.titleIcon !== undefined ? { titleIcon: input.titleIcon } : {}),
        ...(birthDate !== undefined ? { birthDate } : {}),
      },
    });
    return this.getMine(userId);
  }

  async setUsername(userId: string, username: string): Promise<MyProfile> {
    const taken = await this.prisma.user.findUnique({ where: { username } });
    if (taken && taken.id !== userId) {
      throw new ConflictError("Этот ник уже занят.");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { username } });
    return this.getMine(userId);
  }

  async setAvatar(
    userId: string,
    dataUrl: string,
  ): Promise<{ avatarUrl: string }> {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUrl.trim(),
    );
    if (!match) throw new BadRequestError("Ожидается data:image/png|jpeg;base64,…");
    const ext = match[1] === "jpeg" ? "jpg" : "png";
    const buf = Buffer.from(match[2]!, "base64");
    if (buf.byteLength > 5 * 1024 * 1024) {
      throw new BadRequestError("Файл больше 5 МБ.");
    }
    await mkdir(this.uploadsDir, { recursive: true });
    const file = `${userId}.${ext}`;
    await writeFile(join(this.uploadsDir, file), buf);
    const avatarUrl = `/uploads/avatars/${file}?v=${Date.now()}`;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    return { avatarUrl };
  }

  /**
   * Swap to a fresh random reaction gif — the same pool a new account's
   * default avatar comes from, offered here as an explicit "give me a gif
   * instead" choice rather than only something that happens once at signup.
   * Nothing is written to disk (unlike an uploaded photo): just the URL
   * nekos.best already hosts, same as before.
   */
  async setRandomAvatar(userId: string): Promise<{ avatarUrl: string }> {
    const url = await fetchReactionGif(randomReactionCategory());
    if (!url) {
      throw new UpstreamUnavailableError("Не получилось получить гифку, попробуйте ещё раз.");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    return { avatarUrl: url };
  }

  async progress(userId: string): Promise<ProgressDetail[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { proSince: true },
    });
    const isPro = this.proForAll || user.proSince != null;
    // Free accounts track their 10 most recent titles — PRO tracks
    // everything. `rawTake` is rows (one per touched episode, not per
    // anime — see the unique constraint on WatchProgress), generous enough
    // that a PRO account with a long history still gets every title back.
    const animeLimit = isPro ? Number.POSITIVE_INFINITY : PROGRESS_ANIME_LIMIT;
    const rawTake = isPro ? 2000 : 200;

    const [rows, sessions, library] = await Promise.all([
      this.prisma.watchProgress.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
          anime: { select: { slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true } },
        },
        take: rawTake,
      }),
      this.prisma.watchSession.groupBy({
        by: ["animeId"],
        where: { userId },
        _sum: { seconds: true },
      }),
      this.prisma.libraryEntry.findMany({
        where: { userId },
        select: { animeId: true, status: true },
      }),
    ]);

    const sessionByAnime = new Map(
      sessions.map((s) => [s.animeId, s._sum.seconds ?? 0]),
    );
    const statusByAnime = new Map(library.map((l) => [l.animeId, l.status]));

    // One row per anime — its most recently touched episode — not one row
    // per (anime, episode) pair, and capped to the most recent titles.
    // `rows` is already ordered by updatedAt desc, so the first row seen
    // for a given anime is its latest.
    const seen = new Set<number>();
    const perAnime: typeof rows = [];
    for (const r of rows) {
      if (seen.has(r.animeId)) continue;
      seen.add(r.animeId);
      perAnime.push(r);
      if (perAnime.length >= animeLimit) break;
    }

    return perAnime.map((r) => ({
      animeId: r.animeId,
      slug: r.anime.slug,
      title: r.anime.titleLocalized ?? r.anime.title,
      imageUrl: r.anime.imageUrl,
      episode: r.episode,
      episodesTotal: r.anime.episodes,
      positionSeconds: r.positionSeconds,
      durationSeconds: r.durationSeconds,
      completed: r.completed,
      status: statusByAnime.get(r.animeId) ?? null,
      totalSecondsOnTitle:
        sessionByAnime.get(r.animeId) ??
        (r.completed ? EPISODE_SECONDS * r.episode : r.positionSeconds),
      lastWatchedAt: r.updatedAt.toISOString(),
    }));
  }

  async logSession(
    userId: string,
    input: { animeId: number; episode: number; seconds: number; startedAt: string },
  ): Promise<void> {
    if (input.seconds < 15) return;
    await this.prisma.watchSession.create({
      data: {
        userId,
        animeId: input.animeId,
        episode: input.episode,
        seconds: input.seconds,
        startedAt: new Date(input.startedAt),
        endedAt: new Date(),
      },
    });
    // Same numbers, mirrored into an in-memory counter — Prometheus scrapes
    // this later at no extra DB cost, so "total minutes watched right now"
    // is a Grafana panel instead of an aggregate query against Postgres.
    watchSecondsTotal.inc(input.seconds);
    watchSessionsTotal.inc();
  }

  // ---- internals ----

  private async build(userId: string): Promise<PublicProfile> {
    const [user, stats, achievements, standing] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.computeStats(userId),
      this.achievements.list(userId),
      this.getCommenterStanding(userId),
    ]);

    return {
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      accentColor: user.accentColor,
      onlineStatus: user.onlineStatus as PublicProfile["onlineStatus"],
      rank: rankOf(stats.hoursWatched),
      isPro: user.proSince != null,
      memberSince: user.createdAt.toISOString(),
      stats,
      achievements,
      // Re-checked against currently-earned achievements on every read, not
      // just at save time — an achievement removed/renamed server-side can't
      // leave a stale pin on display. Order (first = leftmost) is preserved.
      showcaseAchievementIds: user.showcaseAchievementIds.filter((id) =>
        achievements.some((a) => a.id === id && a.earned),
      ),
      // PRO-only — re-checked on every read, not just at save time, so a
      // lapsed subscription can't leave a stale title on display.
      titlePrefix: user.proSince != null ? user.titlePrefix : null,
      titleIcon:
        user.proSince != null ? (user.titleIcon as PublicProfile["titleIcon"]) : null,
      totalCommentLikes: standing.totalLikes,
      commenterRank: standing.rank,
      totalRankedCommenters: standing.totalRanked,
    };
  }

  /** 1-based rank by total likes received across every (non-deleted)
   * comment, against everyone who's ever posted one. See the cache field
   * above for why this doesn't hit the DB on every call. */
  private async getCommenterStanding(
    userId: string,
  ): Promise<{ totalLikes: number; rank: number | null; totalRanked: number }> {
    const board = await this.commenterLeaderboard.wrap("all", async () => {
      const rows = await this.prisma.comment.groupBy({
        by: ["userId"],
        where: { deletedAt: null },
        _sum: { likeCount: true },
      });
      return rows
        .map((r) => ({ userId: r.userId, total: r._sum.likeCount ?? 0 }))
        .sort((a, b) => b.total - a.total);
    });

    const idx = board.findIndex((r) => r.userId === userId);
    return {
      totalLikes: idx >= 0 ? board[idx]!.total : 0,
      rank: idx >= 0 ? idx + 1 : null,
      totalRanked: board.length,
    };
  }

  private async computeStats(userId: string): Promise<ProfileStats> {
    const [completed, sessionAgg, sessions, scored, completedLib, topRatedRows] =
      await Promise.all([
        this.prisma.watchProgress.findMany({
          where: { userId, completed: true },
          select: { animeId: true, updatedAt: true },
        }),
        this.prisma.watchSession.aggregate({
          where: { userId },
          _sum: { seconds: true },
        }),
        this.prisma.watchSession.findMany({
          where: { userId, endedAt: { not: null } },
          select: { seconds: true, startedAt: true },
        }),
        // Mean of the viewer's own scores from their list (public reviews are gone).
        this.prisma.libraryEntry.findMany({
          where: { userId, score: { not: null } },
          select: { score: true },
        }),
        this.prisma.libraryEntry.count({
          where: { userId, status: "COMPLETED" },
        }),
        // Real personal ratings only — never a title just sitting on the
        // list unscored, however long it's been there.
        this.prisma.libraryEntry.findMany({
          where: { userId, score: { not: null } },
          orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
          take: 3,
          include: {
            anime: { select: { slug: true, title: true, titleLocalized: true, imageUrl: true } },
          },
        }),
      ]);

    const topRated: ProfileStats["topRated"] = topRatedRows.map((r) => ({
      animeId: r.animeId,
      slug: r.anime.slug,
      title: r.anime.titleLocalized ?? r.anime.title,
      imageUrl: r.anime.imageUrl,
      score: r.score!,
    }));

    const episodesWatched = completed.length;
    const sessionSeconds = sessionAgg._sum.seconds ?? 0;
    const hoursWatched =
      Math.round(
        ((sessionSeconds > 0
          ? sessionSeconds
          : episodesWatched * EPISODE_SECONDS) /
          3600) *
          10,
      ) / 10;

    const meanScore = scored.length
      ? Math.round(
          (scored.reduce((n, r) => n + (r.score ?? 0), 0) / scored.length) * 10,
        ) / 10
      : null;

    // most productive day (by session seconds, fallback by completed episodes)
    const dayScore = new Map<string, number>();
    for (const s of sessions) {
      const key = s.startedAt.toISOString().slice(0, 10);
      dayScore.set(key, (dayScore.get(key) ?? 0) + s.seconds);
    }
    if (dayScore.size === 0) {
      for (const c of completed) {
        const key = c.updatedAt.toISOString().slice(0, 10);
        dayScore.set(key, (dayScore.get(key) ?? 0) + 1);
      }
    }
    let mostProductiveDay: string | null = null;
    let best = -1;
    for (const [day, score] of dayScore) {
      if (score > best) {
        best = score;
        mostProductiveDay = day;
      }
    }

    // Two weeks of real watch history, one row per day including the empty
    // ones — a chart with gaps punched out of it reads as "no data here",
    // which is exactly wrong for "you didn't watch anything that day".
    const ACTIVITY_DAYS = 14;
    const minutesByDay = new Map<string, number>();
    for (const s of sessions) {
      const key = s.startedAt.toISOString().slice(0, 10);
      minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + s.seconds / 60);
    }
    const episodesByDay = new Map<string, number>();
    for (const c of completed) {
      const key = c.updatedAt.toISOString().slice(0, 10);
      episodesByDay.set(key, (episodesByDay.get(key) ?? 0) + 1);
    }
    const startOfToday = Date.now();
    const dailyActivity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
      const day = new Date(startOfToday - (ACTIVITY_DAYS - 1 - i) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return {
        day,
        minutes: Math.round(minutesByDay.get(day) ?? 0),
        episodes: episodesByDay.get(day) ?? 0,
      };
    });

    const endedSessions = sessions.filter((s) => s.seconds > 0);
    const avgSessionMinutes = endedSessions.length
      ? Math.round(
          (endedSessions.reduce((n, s) => n + s.seconds, 0) /
            endedSessions.length /
            60) *
            10,
        ) / 10
      : null;

    // top genres by completed episodes
    let topGenres: ProfileStats["topGenres"] = [];
    if (completed.length > 0) {
      const links = await this.prisma.genreOnAnime.findMany({
        where: { animeId: { in: completed.map((c) => c.animeId) } },
        select: { animeId: true, genre: { select: { name: true } } },
      });
      const perAnime = new Map<number, number>();
      for (const c of completed) {
        perAnime.set(c.animeId, (perAnime.get(c.animeId) ?? 0) + 1);
      }
      const perGenre = new Map<string, number>();
      for (const l of links) {
        perGenre.set(
          l.genre.name,
          (perGenre.get(l.genre.name) ?? 0) + (perAnime.get(l.animeId) ?? 0),
        );
      }
      topGenres = [...perGenre.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }

    return {
      episodesWatched,
      hoursWatched,
      titlesCompleted: completedLib,
      meanScore,
      topGenres,
      mostProductiveDay,
      avgSessionMinutes,
      dailyActivity,
      topRated,
    };
  }
}
