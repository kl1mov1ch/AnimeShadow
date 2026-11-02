import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "../packages/db/src/index.ts";
import {
  SHADOW_AVATAR_FRAMES,
  cosmeticUnlocked,
} from "../packages/shared/src/index.ts";
import {
  animeQualifiedEpisodes,
  frameWatchProgress,
} from "../apps/api/src/lib/frame-watch-progress.ts";

test("anime frame goals require half of each episode, capped at 24 distinct episodes", () => {
  let animeFrames = 0;
  for (const frame of SHADOW_AVATAR_FRAMES) {
    if (!("watchAnime" in frame)) continue;
    animeFrames++;
    const rule = frame.watchAnime;
    assert.equal(rule.requiredEpisodes, Math.min(rule.episodesTotal, 24), frame.id);
    assert.equal(
      rule.requiredSeconds,
      rule.requiredEpisodes * Math.ceil(rule.episodeSeconds / 2),
      frame.id,
    );
  }
  assert.equal(animeFrames, 23);
  assert.equal(new Set(SHADOW_AVATAR_FRAMES.flatMap((frame) => "watchAnime" in frame ? [frame.watchAnime.animeId] : [])).size, 22);
  for (const id of ["shadow-naruto", "shadow-black-clover", "shadow-hunter"]) {
    const frame = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === id)!;
    assert.ok("watchAnime" in frame);
    assert.ok(frame.watchAnime.episodesTotal > 24);
    assert.equal(frame.watchAnime.requiredEpisodes, 24);
  }
});

type Playback = { userId: string; animeId: number; episode: number; rewardSeconds: number };

async function verifiedProgress(playback: Playback[], users = ["u"]) {
  return frameWatchProgress({
    watchProgress: new Proxy({}, { get() { throw new Error("Manual episode completion must not unlock a frame"); } }),
    watchSession: {
      groupBy: async (query: { by: string[]; where: Record<string, unknown> }) => {
        assert.deepEqual(query.by, ["userId", "animeId", "episode"]);
        assert.deepEqual(query.where.rewardSeconds, { gt: 0 });
        assert.deepEqual(query.where.endedAt, { not: null });
        assert.deepEqual(query.where.episode, { gte: 1 });
        const animeIds = (query.where.animeId as { in: number[] }).in;
        assert.equal(animeIds.length, 22);
        assert.equal(new Set(animeIds).size, 22);
        const grouped = new Map<string, { userId: string; animeId: number; episode: number; _sum: { rewardSeconds: number } }>();
        for (const row of playback) {
          if (!users.includes(row.userId) || row.episode < 1 || row.rewardSeconds <= 0) continue;
          const key = `${row.userId}:${row.animeId}:${row.episode}`;
          const current = grouped.get(key) ?? { userId: row.userId, animeId: row.animeId, episode: row.episode, _sum: { rewardSeconds: 0 } };
          current._sum.rewardSeconds += row.rewardSeconds;
          grouped.set(key, current);
        }
        return [...grouped.values()];
      },
    },
  } as never, users);
}

test("every title's episode earns exactly one plus at half-runtime, never one second earlier", async () => {
  for (const frame of SHADOW_AVATAR_FRAMES) {
    if (!("watchAnime" in frame)) continue;
    const { animeId, episodeSeconds } = frame.watchAnime;
    const threshold = Math.ceil(episodeSeconds / 2);
    const rows = [{ userId: "u", animeId, episode: 1, rewardSeconds: threshold - 1 }];
    const before = (await verifiedProgress(rows)).get("u")!;
    assert.equal(animeQualifiedEpisodes(before)[animeId], 0, frame.id);
    rows[0]!.rewardSeconds++;
    const after = (await verifiedProgress(rows)).get("u")!;
    assert.equal(animeQualifiedEpisodes(after)[animeId], 1, frame.id);
  }
});

test("Gojo and Jujutsu use identical conditions without duplicating episode credit or progress", async () => {
  const jujutsu = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === "shadow-jujutsu")!;
  const gojo = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === "shadow-gojo")!;
  assert.ok("watchAnime" in jujutsu && "watchAnime" in gojo);
  assert.deepEqual(gojo.watchAnime, jujutsu.watchAnime);
  const { animeId, episodeSeconds, requiredEpisodes } = jujutsu.watchAnime;
  const rows = [{ userId: "u", animeId, episode: 1, rewardSeconds: Math.ceil(episodeSeconds / 2) }];
  const first = (await verifiedProgress(rows)).get("u")!.filter((entry) => entry.animeId === animeId);
  assert.equal(first.length, 1);
  assert.equal(first[0]!.qualifiedEpisodes, 1);
  assert.equal(first[0]!.watchedSeconds, Math.ceil(episodeSeconds / 2));
  for (let episode = 2; episode <= requiredEpisodes; episode++) {
    rows.push({ userId: "u", animeId, episode, rewardSeconds: Math.ceil(episodeSeconds / 2) });
  }
  const progress = (await verifiedProgress(rows)).get("u")!;
  assert.equal(progress.length, 22);
  assert.equal(progress.find((entry) => entry.animeId === animeId)!.qualifiedEpisodes, 24);
  for (const frame of [jujutsu, gojo]) {
    assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame.id, {
      earnedIds: [], level: 1, pro: false, animeQualifiedEpisodes: animeQualifiedEpisodes(progress),
    }), true);
  }
});

test("replays count at most one plus; out-of-range episodes and another user do not contribute", async () => {
  const progress = await verifiedProgress([
    { userId: "u", animeId: 46569, episode: 1, rewardSeconds: 999999 },
    { userId: "u", animeId: 46569, episode: 1, rewardSeconds: 999999 },
    { userId: "u", animeId: 46569, episode: 14, rewardSeconds: 999999 },
    { userId: "u", animeId: 46569, episode: 999, rewardSeconds: 999999 },
    { userId: "u", animeId: 46569, episode: 0, rewardSeconds: 999999 },
    { userId: "other", animeId: 46569, episode: 2, rewardSeconds: 999999 },
  ]);
  const entry = progress.get("u")!.find((row) => row.animeId === 46569)!;
  const qualified = animeQualifiedEpisodes(progress.get("u"));
  assert.equal(entry.watchedSeconds, 1440);
  assert.equal(qualified[46569], 1);
  assert.equal(
    cosmeticUnlocked(SHADOW_AVATAR_FRAMES, "shadow-hells-paradise", {
      earnedIds: [],
      level: 1,
      pro: true,
      animeQualifiedEpisodes: qualified,
    }),
    false,
  );
  assert.equal(qualified[57555], 0);
});

test("minutes from different unfinished episodes never pool into a plus or an unlocked frame", async () => {
  const frame = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === "shadow-naruto")!;
  assert.ok("watchAnime" in frame);
  const { animeId, episodeSeconds, requiredSeconds } = frame.watchAnime;
  const rows = Array.from({ length: 25 }, (_, index) => ({
    userId: "u", animeId, episode: index + 1, rewardSeconds: Math.ceil(episodeSeconds / 2) - 1,
  }));
  const progress = (await verifiedProgress(rows)).get("u")!;
  const entry = progress.find((row) => row.animeId === animeId)!;
  assert.ok(entry.watchedSeconds > requiredSeconds, "even enough aggregate time does not replace qualified episodes");
  assert.equal(entry.qualifiedEpisodes, 0);
  assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame.id, {
    earnedIds: [], level: 1, pro: true, animeQualifiedEpisodes: animeQualifiedEpisodes(progress),
  }), false);

  const splitEpisode = (await verifiedProgress([
    { userId: "u", animeId, episode: 1, rewardSeconds: 345 },
    { userId: "u", animeId, episode: 1, rewardSeconds: 345 },
  ])).get("u")!;
  assert.equal(animeQualifiedEpisodes(splitEpisode)[animeId], 1, "separate validated heartbeats of the same episode may add up");
});

test("long shows unlock after 24 qualified episodes, while a movie needs just one half-runtime", async () => {
  for (const id of ["shadow-naruto", "shadow-reze"]) {
    const frame = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === id)!;
    assert.ok("watchAnime" in frame);
    const { animeId, episodeSeconds, requiredEpisodes } = frame.watchAnime;
    assert.equal(requiredEpisodes, id === "shadow-reze" ? 1 : 24);
    const rows = Array.from({ length: requiredEpisodes }, (_, index) => ({
      userId: "u", animeId, episode: index + 1, rewardSeconds: Math.ceil(episodeSeconds / 2),
    }));
    rows.at(-1)!.rewardSeconds--;
    const before = (await verifiedProgress(rows)).get("u")!;
    assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, id, {
      earnedIds: [], level: 1, pro: false, animeQualifiedEpisodes: animeQualifiedEpisodes(before),
    }), false);
    rows.at(-1)!.rewardSeconds++;
    const after = (await verifiedProgress(rows)).get("u")!;
    assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, id, {
      earnedIds: [], level: 1, pro: false, animeQualifiedEpisodes: animeQualifiedEpisodes(after),
    }), true);
    assert.equal(after.find((row) => row.animeId === animeId)!.qualifiedEpisodes, requiredEpisodes);
  }
});

test("manual completion without reward heartbeats never produces a qualified episode", async () => {
  const progress = (await verifiedProgress([])).get("u")!;
  assert.ok(progress.every((entry) => entry.qualifiedEpisodes === 0 && entry.watchedSeconds === 0));
});

test(
  "real player heartbeats: backdating, retries, manual completion and per-episode replay limits",
  {
    skip: process.env.RUN_FRAME_TIME_DB_TESTS !== "1",
  },
  async () => {
    assert.ok(
      ["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname),
    );
    const prisma = new PrismaClient();
    const rollback = new Error("frame-time-fixture-rollback");
    const id = `ft-${randomUUID()}`;
    const { ProfileService } =
      await import("../apps/api/src/services/profile.service.ts");
    try {
      await assert.rejects(
        prisma.$transaction(
          async (tx) => {
            await tx.user.create({
              data: {
                id,
                email: `${id}@example.invalid`,
                displayName: "Frame time QA",
                passwordHash: "unused-fixture",
              },
            });
            const service = new ProfileService({
              prisma: {
                $transaction: (fn: (db: typeof tx) => unknown) => fn(tx),
              } as never,
              achievements: {} as never,
              uploadsRoot: "unused-frame-time",
            });
            const input = {
              animeId: 46569,
              episode: 1,
              seconds: 86400,
              startedAt: new Date(Date.now() - 86400000).toISOString(),
            };
            await service.logSession(id, input);
            await service.logSession(id, input);
            let total = await tx.watchSession.aggregate({
              where: { userId: id },
              _sum: { rewardSeconds: true },
            });
            assert.equal(
              total._sum.rewardSeconds,
              75,
              "forged day-long start awards at most one heartbeat; replay awards nothing",
            );
            await tx.watchProgress.create({
              data: {
                userId: id,
                animeId: 46569,
                episode: 13,
                completed: true,
                positionSeconds: 99999,
              },
            });
            const beforeReplay = (await frameWatchProgress(tx, [id])).get(id)!;
            assert.equal(beforeReplay.find((row) => row.animeId === 46569)!.watchedSeconds, 75);
            assert.equal(animeQualifiedEpisodes(beforeReplay)[46569], 0);
            await tx.watchSession.createMany({
              data: [
                {
                  userId: id,
                  animeId: 46569,
                  episode: 1,
                  seconds: 20000,
                  rewardSeconds: 20000,
                  startedAt: new Date(),
                  endedAt: new Date(),
                },
                {
                  userId: id,
                  animeId: 46569,
                  episode: 999,
                  seconds: 20000,
                  rewardSeconds: 20000,
                  startedAt: new Date(),
                  endedAt: new Date(),
                },
                {
                  userId: id,
                  animeId: 57555,
                  episode: 1,
                  seconds: 5940,
                  rewardSeconds: 0,
                  startedAt: new Date(),
                  endedAt: new Date(),
                },
              ],
            });
            const afterReplay = (await frameWatchProgress(tx, [id])).get(id)!;
            const qualified = animeQualifiedEpisodes(afterReplay);
            assert.equal(afterReplay.find((row) => row.animeId === 46569)!.watchedSeconds, 1440);
            assert.equal(qualified[46569], 1);
            assert.equal(
              qualified[57555],
              0,
              "legacy time without eligible heartbeats is not backfilled",
            );
            await tx.watchSession.createMany({
              data: Array.from({ length: 12 }, (_, index) => ({
                userId: id,
                animeId: 46569,
                episode: index + 2,
                seconds: index === 11 ? 719 : 720,
                rewardSeconds: index === 11 ? 719 : 720,
                startedAt: new Date(),
                endedAt: new Date(),
              })),
            });
            const almost = (await frameWatchProgress(tx, [id])).get(id)!;
            assert.equal(animeQualifiedEpisodes(almost)[46569], 12);
            assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, "shadow-hells-paradise", {
              earnedIds: [], level: 1, pro: false, animeQualifiedEpisodes: animeQualifiedEpisodes(almost),
            }), false);
            await tx.watchSession.updateMany({
              where: { userId: id, animeId: 46569, episode: 13 },
              data: { seconds: { increment: 1 }, rewardSeconds: { increment: 1 } },
            });
            const ready = (await frameWatchProgress(tx, [id])).get(id)!;
            assert.equal(animeQualifiedEpisodes(ready)[46569], 13);
            assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, "shadow-hells-paradise", {
              earnedIds: [], level: 1, pro: false, animeQualifiedEpisodes: animeQualifiedEpisodes(ready),
            }), true);
            throw rollback;
          },
          { timeout: 20000 },
        ),
        (error) => error === rollback,
      );
      assert.equal(await prisma.user.count({ where: { id } }), 0);
    } finally {
      await prisma.$disconnect();
    }
  },
);
