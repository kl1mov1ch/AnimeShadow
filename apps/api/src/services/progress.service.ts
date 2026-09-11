import {
  ANIME_WITH_GENRES_INCLUDE,
  type PrismaClient,
  type WatchProgress,
  toSummaryDto,
} from "@animeshadow/db";
import type {
  AnimeProgress,
  ContinueWatchingItem,
  EpisodeProgress,
  UpsertProgressInput,
} from "@animeshadow/shared";
import type { AchievementService } from "./achievement.service.js";
import type { CatalogService } from "./catalog.service.js";

export interface ProgressServiceDeps {
  prisma: PrismaClient;
  catalog: CatalogService;
  achievements?: AchievementService;
}

const COMPLETE_RATIO = 0.9;

export class ProgressService {
  private readonly prisma: PrismaClient;
  private readonly catalog: CatalogService;
  private readonly achievements?: AchievementService;

  constructor(deps: ProgressServiceDeps) {
    this.prisma = deps.prisma;
    this.catalog = deps.catalog;
    this.achievements = deps.achievements;
  }

  async upsert(
    userId: string,
    animeId: number,
    input: UpsertProgressInput,
  ): Promise<AnimeProgress> {
    await this.catalog.getAnimeById(animeId, "en");

    const completed =
      input.completed ??
      (input.durationSeconds
        ? input.positionSeconds >= input.durationSeconds * COMPLETE_RATIO
        : false);

    await this.prisma.watchProgress.upsert({
      where: {
        userId_animeId_episode: { userId, animeId, episode: input.episode },
      },
      create: {
        userId,
        animeId,
        episode: input.episode,
        positionSeconds: input.positionSeconds,
        durationSeconds: input.durationSeconds ?? null,
        completed,
        translationId: input.translationId ?? null,
      },
      update: {
        positionSeconds: input.positionSeconds,
        ...(input.durationSeconds != null
          ? { durationSeconds: input.durationSeconds }
          : {}),
        completed,
        ...(input.translationId !== undefined
          ? { translationId: input.translationId }
          : {}),
      },
    });

    await this.syncLibrary(userId, animeId, input.episode, completed);
    if (completed) {
      // Fire-and-forget: don't make a progress save wait on achievement math.
      void this.achievements?.recompute(userId).catch(() => undefined);
    }
    return this.get(userId, animeId);
  }

  async get(userId: string, animeId: number): Promise<AnimeProgress> {
    const rows = await this.prisma.watchProgress.findMany({
      where: { userId, animeId },
      orderBy: { episode: "asc" },
    });

    const byRecency = [...rows].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    const resume = byRecency.find((r) => !r.completed) ?? byRecency[0];

    return {
      animeId,
      episodes: rows.map(toEpisodeProgress),
      resumeEpisode: resume?.episode ?? null,
      resumePositionSeconds:
        resume && !resume.completed ? resume.positionSeconds : 0,
      lastTranslationId: resume?.translationId ?? null,
      watchedCount: rows.filter((r) => r.completed).length,
    };
  }

  async continueWatching(userId: string, limit = 20): Promise<ContinueWatchingItem[]> {
    const rows = await this.prisma.watchProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 250,
      include: { anime: { include: ANIME_WITH_GENRES_INCLUDE } },
    });

    const seen = new Set<number>();
    const items: ContinueWatchingItem[] = [];
    for (const row of rows) {
      if (seen.has(row.animeId)) continue;
      seen.add(row.animeId);

      const total = row.anime.episodes;
      const caughtUp = row.completed && total != null && row.episode >= total;
      if (caughtUp) continue;

      items.push({
        anime: toSummaryDto(row.anime),
        episode: row.episode,
        positionSeconds: row.completed ? 0 : row.positionSeconds,
        durationSeconds: row.durationSeconds,
        updatedAt: row.updatedAt.toISOString(),
      });
      if (items.length >= limit) break;
    }
    return items;
  }

  private async syncLibrary(
    userId: string,
    animeId: number,
    episode: number,
    completed: boolean,
  ): Promise<void> {
    const watched = completed ? episode : Math.max(0, episode - 1);
    const existing = await this.prisma.libraryEntry.findUnique({
      where: { userId_animeId: { userId, animeId } },
    });

    if (!existing) {
      await this.prisma.libraryEntry
        .create({
          data: { userId, animeId, status: "WATCHING", progress: watched },
        })
        .catch(() => undefined);
      return;
    }
    if (
      existing.progress < watched ||
      (existing.status === "PLANNED" && watched > 0)
    ) {
      await this.prisma.libraryEntry.update({
        where: { id: existing.id },
        data: {
          progress: Math.max(existing.progress, watched),
          ...(existing.status === "PLANNED" ? { status: "WATCHING" } : {}),
        },
      });
    }
  }
}

function toEpisodeProgress(row: WatchProgress): EpisodeProgress {
  return {
    episode: row.episode,
    positionSeconds: row.positionSeconds,
    durationSeconds: row.durationSeconds,
    completed: row.completed,
    updatedAt: row.updatedAt.toISOString(),
  };
}
