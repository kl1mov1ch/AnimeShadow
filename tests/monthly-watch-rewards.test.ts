import assert from "node:assert/strict";
import { test } from "node:test";
import { MONTHLY_AWARD_GRACE_MS, watchMonth } from "../apps/api/src/lib/watch-month.ts";
import { settleWatchMonths } from "../apps/api/src/services/monthly-watch-rewards.ts";

const COMPETITION = "watch-monthly-cosmetic";

test("monthly cosmetics use Moscow calendar boundaries, leap February and the new year", () => {
  assert.equal(watchMonth(new Date("2026-10-31T20:59:59.999Z")).start.toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(watchMonth(new Date("2026-10-31T21:00:00Z")).start.toISOString(), "2026-10-31T21:00:00.000Z");
  const leap = watchMonth(new Date("2040-02-14T00:00:00Z"));
  assert.equal(leap.start.toISOString(), "2040-01-31T21:00:00.000Z");
  assert.equal(leap.end.toISOString(), "2040-02-29T21:00:00.000Z");
  const ordinary = watchMonth(new Date("2039-02-14T00:00:00Z"));
  assert.equal(ordinary.end.toISOString(), "2039-02-28T21:00:00.000Z");
  const december = watchMonth(new Date("2026-12-31T20:59:59Z"));
  assert.equal(december.end.toISOString(), "2026-12-31T21:00:00.000Z");
  assert.equal(watchMonth(december.end).start.toISOString(), december.end.toISOString());
});

test("a fresh monthly competition never awards historical months, including activation during grace", async () => {
  for (const timestamp of ["2040-02-29T21:01:00Z", "2040-03-15T12:00:00Z"]) {
    const now = new Date(timestamp);
    const tx = {
      $queryRaw: async () => [{ acquired: true }],
      leaderboardRewardCursor: {
        upsert: async ({ create }: { create: { nextWeek: Date } }) => {
          assert.equal(create.nextWeek.toISOString(), watchMonth(now).start.toISOString());
          return create;
        },
      },
      $executeRaw: async () => assert.fail("fresh activation must not issue historical receipts"),
    };
    assert.equal(await settleWatchMonths(tx as never, now), 0);
  }
});

test("a competing monthly settlement exits before accessing the checkpoint", async () => {
  const tx = { $queryRaw: async () => [{ acquired: false }] };
  assert.equal(await settleWatchMonths(tx as never), 0);
});

test("monthly settlement waits for the last heartbeat and advances once across variable month lengths", async () => {
  const current = watchMonth(new Date("2040-03-05T12:00:00Z")).start;
  let checkpoint = watchMonth(new Date(current.getTime() - 1)).start;
  let insertions = 0;
  const tx = {
    $queryRaw: async () => [{ acquired: true }],
    $executeRaw: async () => { insertions++; return 17; },
    leaderboardRewardCursor: {
      upsert: async () => ({ nextWeek: checkpoint }),
      update: async ({ data }: { data: { nextWeek: Date } }) => { checkpoint = data.nextWeek; },
    },
  };
  assert.equal(await settleWatchMonths(tx as never, new Date(current.getTime() + MONTHLY_AWARD_GRACE_MS - 1)), 0);
  assert.equal(insertions, 0);
  assert.equal(await settleWatchMonths(tx as never, new Date(current.getTime() + MONTHLY_AWARD_GRACE_MS)), 17);
  assert.equal(checkpoint.toISOString(), current.toISOString());
  assert.equal(await settleWatchMonths(tx as never, new Date(current.getTime() + MONTHLY_AWARD_GRACE_MS)), 0);
  assert.equal(insertions, 1);
});

test("an outage catch-up is bounded and resumes from its persistent calendar checkpoint", async () => {
  let checkpoint = watchMonth(new Date("2030-01-15T12:00:00Z")).start;
  const now = new Date("2032-01-15T12:00:00Z");
  let inserts = 0;
  const tx = {
    $queryRaw: async () => [{ acquired: true }],
    $executeRaw: async () => { inserts++; return 1; },
    leaderboardRewardCursor: {
      upsert: async () => ({ nextWeek: checkpoint }),
      update: async ({ data }: { data: { nextWeek: Date } }) => { checkpoint = data.nextWeek; },
    },
  };
  assert.equal(await settleWatchMonths(tx as never, now), 6);
  assert.equal(checkpoint.toISOString(), "2030-06-30T21:00:00.000Z");
  assert.equal(await settleWatchMonths(tx as never, now), 6);
  assert.equal(checkpoint.toISOString(), "2030-12-31T21:00:00.000Z");
  assert.equal(inserts, 12);
});

test("monthly PostgreSQL awards: top 999, privacy, ties, deduplication, unchanged PRO and atomic rollback", {
  skip: process.env.RUN_MONTHLY_DB_TESTS !== "1",
}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "5433", "monthly DB fixtures require local port 5433");
  const { createPrismaClient } = await import("../packages/db/dist/index.js");
  const db = createPrismaClient({ poolMax: 2 });
  const rollback = new Error("ROLL BACK MONTHLY TEST FIXTURES");
  const now = new Date("2040-03-05T12:00:00Z");
  const current = watchMonth(now).start;
  const start = watchMonth(new Date(current.getTime() - 1)).start;
  const prefix = `monthly-qa-${Date.now()}`;
  const id = (index: number) => `${prefix}-${String(index).padStart(4, "0")}`;
  const beforeCursor = await db.leaderboardRewardCursor.findUnique({ where: { id: COMPETITION } });
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.leaderboardRewardCursor.upsert({
        where: { id: COMPETITION },
        create: { id: COMPETITION, nextWeek: start },
        update: { nextWeek: start },
      });
      const future = new Date(now.getTime() + 30 * 86_400_000);
      await tx.user.createMany({
        data: Array.from({ length: 1009 }, (_, index) => ({
          id: id(index), email: `${id(index)}@example.invalid`, passwordHash: "test-only", displayName: "Monthly QA",
          ...(index === 0 ? { proSince: now, proUntil: future } : index === 1 ? { trialUntil: future } : index === 2 ? { proSince: now, proUntil: null } : {}),
          ...(index === 1001 ? { isBanned: true }
            : index === 1002 ? { profilePrivacy: { stats: "private" } }
              : index === 1003 ? { profilePrivacy: { profile: "private" } }
                : index === 1004 ? { profilePrivacy: { profile: "users" } }
                  : index === 1005 ? { profilePrivacy: { stats: "users" } } : {}),
        })),
      });
      await tx.watchSession.createMany({
        data: [
          ...Array.from({ length: 1001 }, (_, index) => ({
            userId: id(index), animeId: 1, seconds: index === 2 || index === 3 ? 1200 : 600,
            startedAt: index === 1000 ? start : new Date(start.getTime() + 10_000),
          })),
          ...Array.from({ length: 5 }, (_, index) => ({ userId: id(1001 + index), animeId: 1, seconds: 999_999, startedAt: start })),
          { userId: id(1006), animeId: 1, seconds: 0, startedAt: start },
          { userId: id(1007), animeId: 1, seconds: 999_999, startedAt: new Date(start.getTime() - 1) },
          { userId: id(1008), animeId: 1, seconds: 999_999, startedAt: current },
          { userId: id(0), animeId: 1, seconds: 600, startedAt: start },
          { userId: id(1), animeId: 2, seconds: 600, startedAt: start },
        ],
      });
      const proSelect = { id: true, proSince: true, proUntil: true, trialUntil: true } as const;
      const proBefore = await tx.user.findMany({ where: { id: { in: [id(0), id(1), id(2)] } }, select: proSelect, orderBy: { id: "asc" } });
      assert.equal(await settleWatchMonths(tx, new Date(current.getTime() + MONTHLY_AWARD_GRACE_MS - 1)), 0);
      assert.equal(await settleWatchMonths(tx, now), 999);
      assert.equal(await db.$transaction((other) => settleWatchMonths(other, now)), 0, "another worker cannot settle the month while the transaction owns its lock");
      const receipts = await tx.monthlyWatchAward.findMany({ where: { monthStart: start }, orderBy: { place: "asc" } });
      assert.equal(receipts.length, 999);
      assert.deepEqual(receipts.slice(0, 4).map((receipt) => receipt.userId), [id(1), id(0), id(2), id(3)], "ties use titles, then a stable account id");
      assert.equal(receipts[0]!.seconds, 1200n);
      assert.equal(receipts[0]!.titles, 2);
      assert.equal(receipts[998]!.place, 999);
      assert.equal(receipts[998]!.userId, id(998));
      assert.equal(new Set(receipts.map((receipt) => receipt.userId)).size, 999);
      assert(receipts.every((receipt) => Number(receipt.userId.slice(-4)) < 999), "private/banned/zero-time/out-of-month users and places over 999 receive no award");
      assert.deepEqual(await tx.user.findMany({ where: { id: { in: [id(0), id(1), id(2)] } }, select: proSelect, orderBy: { id: "asc" } }), proBefore, "monthly cosmetics never change paid, trial or lifetime PRO");
      assert.equal(await settleWatchMonths(tx, now), 0, "the advanced checkpoint prevents replay");
      await tx.leaderboardRewardCursor.update({ where: { id: COMPETITION }, data: { nextWeek: start } });
      assert.equal(await settleWatchMonths(tx, now), 0, "receipt uniqueness also prevents duplicates after a checkpoint replay");
      assert.equal(await tx.monthlyWatchAward.count({ where: { monthStart: start } }), 999);
      assert.equal((await tx.leaderboardRewardCursor.findUniqueOrThrow({ where: { id: COMPETITION } })).nextWeek.toISOString(), current.toISOString());
      throw rollback;
    }, { timeout: 30_000 }), (error) => error === rollback);
    assert.equal(await db.user.count({ where: { id: { startsWith: prefix } } }), 0);
    assert.equal(await db.monthlyWatchAward.count({ where: { userId: { startsWith: prefix } } }), 0);
    assert.deepEqual(await db.leaderboardRewardCursor.findUnique({ where: { id: COMPETITION } }), beforeCursor, "a failed transaction cannot advance the persistent checkpoint");
  } finally {
    await db.$disconnect();
  }
});
