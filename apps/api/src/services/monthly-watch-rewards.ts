import type { Prisma, PrismaClient } from "@animeshadow/db";
import type { FastifyBaseLogger } from "fastify";
import { MONTHLY_AWARD_GRACE_MS, watchMonth } from "../lib/watch-month.js";

const COMPETITION = "watch-monthly-cosmetic";
const MAX_MONTHS_PER_SETTLEMENT = 6;

/** A separate checkpoint and lock make receipts atomic across all API workers. */
export async function settleWatchMonths(tx: Prisma.TransactionClient, now = new Date()) {
  const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(726401, 2) AS acquired
  `;
  if (!lock?.acquired) return 0;

  // Final player heartbeats may arrive just after Moscow midnight.
  const current = watchMonth(new Date(now.getTime() - MONTHLY_AWARD_GRACE_MS)).start;
  const cursor = await tx.leaderboardRewardCursor.upsert({
    where: { id: COMPETITION },
    // The generic cursor's legacy field stores a month boundary for this id.
    // On first activation, skip all historical months, even during the grace window.
    create: { id: COMPETITION, nextWeek: watchMonth(now).start },
    update: {},
  });
  let start = cursor.nextWeek;
  let awarded = 0;
  for (let count = 0; start < current && count < MAX_MONTHS_PER_SETTLEMENT; count++) {
    const end = watchMonth(start).end;
    // Aggregate once and insert the complete top in one statement; no per-user writes.
    awarded += await tx.$executeRaw`
      INSERT INTO "MonthlyWatchAward" ("monthStart", place, "userId", seconds, titles, "awardedAt")
      SELECT ${start},
        ROW_NUMBER() OVER (ORDER BY winners.seconds DESC, winners.titles DESC, winners."userId" ASC)::integer,
        winners."userId", winners.seconds, winners.titles, ${now}
      FROM (
        SELECT u.id AS "userId", SUM(w.seconds)::bigint AS seconds,
          COUNT(DISTINCT w."animeId")::integer AS titles
        FROM "WatchSession" w JOIN "User" u ON u.id = w."userId"
        WHERE w."startedAt" >= ${start} AND w."startedAt" < ${end}
          AND w.seconds > 0 AND u."isBanned" = false
          AND COALESCE(u."profilePrivacy"->>'profile', 'public') = 'public'
          AND COALESCE(u."profilePrivacy"->>'stats', 'public') = 'public'
        GROUP BY u.id
        ORDER BY seconds DESC, titles DESC, u.id ASC LIMIT 999
      ) AS winners
      ON CONFLICT DO NOTHING
    `;
    start = end;
    await tx.leaderboardRewardCursor.update({
      where: { id: COMPETITION },
      data: { nextWeek: start },
    });
  }
  return awarded;
}

export function startMonthlyWatchRewards(prisma: PrismaClient, log: FastifyBaseLogger) {
  let stopped = false;
  let pending: Promise<void> | undefined;
  const run = () => {
    if (stopped || pending) return;
    pending = prisma.$transaction((tx) => settleWatchMonths(tx), { timeout: 30_000 })
      .then((awarded) => {
        if (awarded) log.info({ awarded }, "Monthly watch cosmetics issued");
      })
      .catch((err: unknown) => {
        log.error({ err }, "Monthly watch cosmetics failed; will retry next minute");
      })
      .finally(() => { pending = undefined; });
  };
  run();
  const timer = setInterval(run, 60_000);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
