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
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import { isProfane } from "../lib/profanity.js";
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

  async getMine(userId: string): Promise<MyProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const base = await this.build(userId);
    const theme =
      user.theme === "light" || user.theme === "dark" || user.theme === "system"
        ? user.theme
        : null;
    return { ...base, email: user.email, theme };
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

  async progress(userId: string): Promise<ProgressDetail[]> {
    const [rows, sessions, library] = await Promise.all([
      this.prisma.watchProgress.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
          anime: { select: { slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true } },
        },
        take: 200,
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
      if (perAnime.length >= PROGRESS_ANIME_LIMIT) break;
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
  }

  // ---- internals ----

  private async build(userId: string): Promise<PublicProfile> {
    const [user, stats, achievements] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.computeStats(userId),
      this.achievements.list(userId),
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
    };
  }

  private async computeStats(userId: string): Promise<ProfileStats> {
    const [completed, sessionAgg, sessions, reviews, completedLib] =
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
        this.prisma.review.findMany({
          where: { userId },
          select: { rating: true },
        }),
        this.prisma.libraryEntry.count({
          where: { userId, status: "COMPLETED" },
        }),
      ]);

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

    const meanScore = reviews.length
      ? Math.round(
          (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length) * 10,
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
    };
  }
}
