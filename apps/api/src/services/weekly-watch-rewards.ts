import type { Prisma, PrismaClient } from "@animeshadow/db";
import type { FastifyBaseLogger } from "fastify";
import { addProDays } from "../lib/pro.js";
import { watchWeek, WEEK_MS, WEEKLY_PRO_DAYS } from "../lib/watch-week.js";

const COMPETITION = "watch-weekly-pro";
type Winner = { userId: string; seconds: bigint; titles: bigint };

/** One transaction owns the checkpoint, the three grants and the immutable receipts. */
export async function settleWatchWeeks(tx: Prisma.TransactionClient, now = new Date()) {
  const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(726401, 1) AS acquired
  `;
  if (!lock?.acquired) return 0;
  // Give the final 60-second player heartbeat time to reach the server before closing the week.
  const current = watchWeek(new Date(now.getTime() - 120_000)).start;
  const cursor = await tx.leaderboardRewardCursor.upsert({
    where: { id: COMPETITION },
    // Activation starts with this week. Never grant years of historical prizes on first boot.
    create: { id: COMPETITION, nextWeek: current },
    update: {},
  });
  let start = cursor.nextWeek;
  let granted = 0;
  // Bound recovery work after a long outage; the next tick continues from the checkpoint.
  for (let count = 0; start < current && count < 8; count++) {
    const end = new Date(start.getTime() + WEEK_MS);
    const winners = await tx.$queryRaw<Winner[]>`
      SELECT u.id AS "userId", SUM(w.seconds)::bigint AS seconds,
        COUNT(DISTINCT w."animeId") AS titles
      FROM "WatchSession" w JOIN "User" u ON u.id = w."userId"
      WHERE w."startedAt" >= ${start} AND w."startedAt" < ${end}
        AND w.seconds > 0 AND u."isBanned" = false
        AND COALESCE(u."profilePrivacy"->>'profile', 'public') = 'public'
        AND COALESCE(u."profilePrivacy"->>'stats', 'public') = 'public'
      GROUP BY u.id
      ORDER BY seconds DESC, titles DESC, u.id ASC LIMIT 3
    `;
    for (const [index, winner] of winners.entries()) {
      const days = WEEKLY_PRO_DAYS[index]!;
      const { proUntil } = await addProDays(tx, winner.userId, days, now);
      await tx.weeklyWatchReward.create({
        data: {
          weekStart: start,
          userId: winner.userId,
          place: index + 1,
          days,
          seconds: winner.seconds,
          titles: Number(winner.titles),
          proUntilAfter: proUntil,
          awardedAt: now,
        },
      });
      granted++;
    }
    start = end;
    await tx.leaderboardRewardCursor.update({
      where: { id: COMPETITION },
      data: { nextWeek: start },
    });
  }
  return granted;
}

export function startWeeklyWatchRewards(prisma: PrismaClient, log: FastifyBaseLogger) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const granted = await prisma.$transaction((tx) => settleWatchWeeks(tx), {
        timeout: 30_000,
      });
      if (granted) log.info({ granted }, "Weekly watch PRO rewards issued");
    } catch (err) {
      log.error({ err }, "Weekly watch rewards failed; will retry next minute");
    } finally {
      running = false;
    }
  };
  // Called only after listen; preflight and multiple workers share a DB lock and checkpoint.
  void run();
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
