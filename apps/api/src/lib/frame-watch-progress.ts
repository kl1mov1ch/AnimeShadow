import type { PrismaClient } from "@animeshadow/db";
import { SHADOW_AVATAR_FRAMES, type FrameWatchProgress } from "@animeshadow/shared";

const watchedFrames = [
  ...new Map(
    SHADOW_AVATAR_FRAMES.flatMap((frame) =>
      "watchAnime" in frame
        ? [[frame.watchAnime.animeId, frame.watchAnime] as const]
        : [],
    ),
  ).values(),
];

/** Only elapsed player heartbeats count. Replays are capped at one runtime per episode. */
export async function frameWatchProgress(
  prisma: Pick<PrismaClient, "watchSession">,
  userIds: readonly string[],
): Promise<Map<string, FrameWatchProgress[]>> {
  const result = new Map<string, FrameWatchProgress[]>();
  if (userIds.length === 0) return result;
  const rows = await prisma.watchSession.groupBy({
    by: ["userId", "animeId", "episode"],
    where: {
      userId: { in: [...new Set(userIds)] },
      animeId: { in: watchedFrames.map((frame) => frame.animeId) },
      rewardSeconds: { gt: 0 },
      endedAt: { not: null },
      episode: { gte: 1 },
    },
    _sum: { rewardSeconds: true },
  });
  const totals = new Map<string, number>();
  const qualified = new Map<string, number>();
  for (const row of rows) {
    const rule = watchedFrames.find((frame) => frame.animeId === row.animeId);
    if (!rule || row.episode > rule.episodesTotal) continue;
    const key = `${row.userId}:${row.animeId}`;
    totals.set(
      key,
      (totals.get(key) ?? 0) +
        Math.min(rule.episodeSeconds, Math.max(0, row._sum.rewardSeconds ?? 0)),
    );
    if ((row._sum.rewardSeconds ?? 0) >= Math.ceil(rule.episodeSeconds / 2))
      qualified.set(key, (qualified.get(key) ?? 0) + 1);
  }
  for (const userId of userIds) {
    result.set(
      userId,
      watchedFrames.map((frame) => ({
        animeId: frame.animeId,
        watchedSeconds: totals.get(`${userId}:${frame.animeId}`) ?? 0,
        qualifiedEpisodes: qualified.get(`${userId}:${frame.animeId}`) ?? 0,
        requiredEpisodes: frame.requiredEpisodes,
        requiredSeconds: frame.requiredSeconds,
      })),
    );
  }
  return result;
}

export function animeQualifiedEpisodes(
  progress: readonly FrameWatchProgress[] = [],
): Readonly<Record<number, number>> {
  return Object.fromEntries(
    progress.map((entry) => [entry.animeId, entry.qualifiedEpisodes]),
  );
}
