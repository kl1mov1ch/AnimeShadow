import assert from "node:assert/strict";
import { test } from "node:test";
import { watchWeek, WEEK_MS } from "../apps/api/src/lib/watch-week.ts";
import { settleWatchWeeks } from "../apps/api/src/services/weekly-watch-rewards.ts";
import { addProDays } from "../apps/api/src/lib/pro.ts";

test("watch rewards use Monday Moscow midnight across week and year boundaries", () => {
  assert.equal(
    watchWeek(new Date("2026-11-01T20:59:59Z")).start.toISOString(),
    "2026-10-25T21:00:00.000Z",
  );
  assert.equal(
    watchWeek(new Date("2026-11-01T21:00:00Z")).start.toISOString(),
    "2026-11-01T21:00:00.000Z",
  );
  const year = watchWeek(new Date("2027-01-01T01:00:00Z"));
  assert.equal(year.start.toISOString(), "2026-12-27T21:00:00.000Z");
  assert.equal(year.end.getTime() - year.start.getTime(), WEEK_MS);
});

test("another settlement worker does not issue rewards while the database lock is held", async () => {
  const tx = { $queryRaw: async () => [{ acquired: false }] };
  assert.equal(await settleWatchWeeks(tx as never), 0);
});

test(
  "weekly PRO: real PostgreSQL grants, privacy, ties, stacking, idempotency and rollback",
  {
    skip: process.env.RUN_WEEKLY_DB_TESTS !== "1",
  },
  async () => {
    const url = new URL(process.env.DATABASE_URL!);
    assert(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      "test only runs against a local database",
    );
    const { createPrismaClient } = await import("../packages/db/dist/index.js");
    const db = createPrismaClient({ poolMax: 2 });
    const rollback = new Error("ROLL BACK ALL TEST FIXTURES");
    const now = new Date("2037-11-09T12:00:00Z");
    const current = watchWeek(now).start;
    const start = new Date(current.getTime() - WEEK_MS);
    const prefix = `weekly-qa-${Date.now()}`;
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            await tx.leaderboardRewardCursor.upsert({
              where: { id: "watch-weekly-pro" },
              create: { id: "watch-weekly-pro", nextWeek: start },
              update: { nextWeek: start },
            });
            const future = new Date(now.getTime() + 10 * 86_400_000);
            for (let i = 0; i < 6; i++) {
              await tx.user.create({
                data: {
                  id: `${prefix}-${i}`,
                  email: `${prefix}-${i}@example.invalid`,
                  passwordHash: "test-only",
                  displayName: "Weekly QA",
                  ...(i === 0
                    ? { proSince: now, proUntil: future }
                    : i === 1
                      ? { trialUntil: future }
                      : i === 2
                        ? { proSince: now, proUntil: null }
                        : {}),
                  ...(i === 4
                    ? { isBanned: true }
                    : i === 5
                      ? { profilePrivacy: { stats: "private" } }
                      : {}),
                },
              });
              await tx.watchSession.create({
                data: {
                  userId: `${prefix}-${i}`,
                  animeId: 1,
                  startedAt: new Date(start.getTime() + 1000),
                  seconds: i >= 4 ? 99_999 : 1000 - i * 100,
                },
              });
            }
            assert.equal(
              await settleWatchWeeks(tx, new Date(current.getTime() + 119_000)),
              0,
              "the final player heartbeat gets a two-minute grace window",
            );
            assert.equal(await settleWatchWeeks(tx, now), 3);
            const receipts = await tx.weeklyWatchReward.findMany({
              where: { weekStart: start },
              orderBy: { place: "asc" },
            });
            assert.deepEqual(
              receipts.map((r) => [r.userId, r.days]),
              [
                [`${prefix}-0`, 7],
                [`${prefix}-1`, 5],
                [`${prefix}-2`, 3],
              ],
            );
            assert.equal(
              receipts[0]!.proUntilAfter!.getTime(),
              future.getTime() + 7 * 86_400_000,
            );
            assert.equal(
              receipts[1]!.proUntilAfter!.getTime(),
              future.getTime() + 5 * 86_400_000,
            );
            assert.equal(
              receipts[2]!.proUntilAfter,
              null,
              "permanent PRO is never shortened",
            );
            assert.equal(
              await settleWatchWeeks(tx, now),
              0,
              "a second run never grants twice",
            );
            const extra = await addProDays(tx, `${prefix}-0`, 3, now);
            assert.equal(extra.proUntil!.getTime(), future.getTime() + 10 * 86_400_000);
            const fresh = await addProDays(tx, `${prefix}-3`, 3, now);
            assert.equal(fresh.proUntil!.getTime(), now.getTime() + 3 * 86_400_000);
            // Equal time: more distinct titles wins, then stable account ID.
            await tx.leaderboardRewardCursor.update({
              where: { id: "watch-weekly-pro" },
              data: { nextWeek: current },
            });
            for (const i of [0, 1])
              await tx.watchSession.create({
                data: {
                  userId: `${prefix}-${i}`,
                  animeId: 1,
                  startedAt: current,
                  seconds: 100,
                },
              });
            await tx.watchSession.create({
              data: {
                userId: `${prefix}-1`,
                animeId: 2,
                startedAt: current,
                seconds: 100,
              },
            });
            await tx.watchSession.create({
              data: {
                userId: `${prefix}-0`,
                animeId: 1,
                startedAt: current,
                seconds: 100,
              },
            });
            assert.equal(
              await settleWatchWeeks(tx, new Date(now.getTime() + WEEK_MS)),
              2,
            );
            assert.equal(
              (
                await tx.weeklyWatchReward.findUniqueOrThrow({
                  where: { weekStart_place: { weekStart: current, place: 1 } },
                })
              ).userId,
              `${prefix}-1`,
            );
            const { ProfileService } =
              await import("../apps/api/src/services/profile.service.ts");
            const profile = new ProfileService({
              prisma: {
                $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
              } as never,
              achievements: {} as never,
              uploadsRoot: "tmp/weekly-qa-unused",
            });
            const watchInput = {
              animeId: 1,
              episode: 1,
              seconds: 60,
              startedAt: new Date(Date.now() - 60_000).toISOString(),
            };
            await profile.logSession(`${prefix}-3`, watchInput);
            await profile.logSession(`${prefix}-3`, watchInput);
            const recorded = await tx.watchSession.aggregate({
              where: { userId: `${prefix}-3`, endedAt: { not: null } },
              _sum: { seconds: true },
              _count: true,
            });
            assert.equal(
              recorded._sum.seconds,
              60,
              "replaying a session cannot double its time",
            );
            assert.equal(recorded._count, 1);
            const session = await tx.watchSession.findFirstOrThrow({
              where: { userId: `${prefix}-3`, endedAt: { not: null } },
            });
            await tx.watchSession.update({
              where: { id: session.id },
              data: {
                startedAt: new Date(Date.now() - 90_000),
                endedAt: new Date(Date.now() - 30_000),
              },
            });
            await profile.logSession(`${prefix}-3`, {
              ...watchInput,
              startedAt: new Date(Date.now() - 30_000).toISOString(),
              seconds: 30,
            });
            const heartbeat = await tx.watchSession.aggregate({
              where: { userId: `${prefix}-3`, endedAt: { not: null } },
              _sum: { seconds: true },
              _count: true,
            });
            assert.equal(heartbeat._sum.seconds, 90);
            assert.equal(
              heartbeat._count,
              1,
              "a continuous heartbeat extends a session rather than creating rows every minute",
            );
            throw rollback;
          },
          { timeout: 30_000 },
        ),
        (error) => error === rollback,
      );
      assert.equal(
        await db.user.count({ where: { id: { startsWith: prefix } } }),
        0,
        "all fixtures and grants are rolled back",
      );
    } finally {
      await db.$disconnect();
    }
  },
);
