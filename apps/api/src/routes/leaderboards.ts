import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { TtlCache } from "../lib/cache.js";
import { watchWeek, WEEKLY_PRO_DAYS } from "../lib/watch-week.js";

interface WatchRow {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  seconds: bigint;
  titles: bigint;
  rank: bigint;
}

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  // Public statistics only: one shared aggregate per period, no per-viewer joins.
  const cache = new TtlCache<WatchRow[]>(60_000, 3);
  app.get("/leaderboards/watch", { preHandler: app.optionalAuth }, async (request) => {
    const { period } = parse(
      z.object({ period: z.enum(["week", "month", "all"]).default("week") }),
      request.query,
    );
    const week = watchWeek();
    const rows = await cache.wrap(`${period}:${week.start.toISOString()}`, async () => {
      const since =
        period === "all"
          ? new Date(0)
          : period === "week"
            ? week.start
            : new Date(Date.now() - 30 * 86_400_000);
      const until = period === "week" ? week.end : new Date();
      return app.prisma.$queryRaw<WatchRow[]>`
        SELECT u.id AS "userId", u."displayName", u.username, u."avatarUrl",
          SUM(w.seconds)::bigint AS seconds, COUNT(DISTINCT w."animeId") AS titles,
          ROW_NUMBER() OVER (ORDER BY SUM(w.seconds) DESC, COUNT(DISTINCT w."animeId") DESC, u.id ASC) AS rank
        FROM "WatchSession" w JOIN "User" u ON u.id = w."userId"
        WHERE w."startedAt" >= ${since} AND w."startedAt" < ${until} AND w.seconds > 0 AND u."isBanned" = false
          AND COALESCE(u."profilePrivacy"->>'profile', 'public') = 'public'
          AND COALESCE(u."profilePrivacy"->>'stats', 'public') = 'public'
        GROUP BY u.id ORDER BY seconds DESC, titles DESC, u.id ASC
      `;
    });
    const dto = (r: WatchRow) => ({
      ...r,
      rank: Number(r.rank),
      seconds: Number(r.seconds),
      titles: Number(r.titles),
    });
    const mine = rows.find((row) => row.userId === request.userId);
    return {
      period,
      top: rows.slice(0, 50).map(dto),
      me: mine ? dto(mine) : null,
      participants: rows.length,
      week: {
        startsAt: week.start.toISOString(),
        endsAt: week.end.toISOString(),
        proDays: WEEKLY_PRO_DAYS,
      },
    };
  });
};
