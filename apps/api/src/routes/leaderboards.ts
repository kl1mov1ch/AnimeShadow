import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { TtlCache } from "../lib/cache.js";
import { watchWeek, WEEKLY_PRO_DAYS } from "../lib/watch-week.js";
import { watchMonth } from "../lib/watch-month.js";
import { publicUserCards } from "../lib/public-user-cards.js";

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
  app.get("/leaderboards/watch", { preHandler: app.authenticate }, async (request) => {
    const { period } = parse(
      z.object({ period: z.enum(["week", "month", "all"]).default("week") }),
      request.query,
    );
    const week = watchWeek();
    const month = watchMonth();
    const boundary = period === "month" ? month.start : week.start;
    const rows = await cache.wrap(`${period}:${boundary.toISOString()}`, async () => {
      const since =
        period === "all"
          ? new Date(0)
          : period === "week"
            ? week.start
            : month.start;
      const until = period === "week" ? week.end : period === "month" ? month.end : new Date();
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
    const mine = rows.find((row) => row.userId === request.userId);
    const top = rows.slice(0, 50);
    // Public identities are decorated once for the visible rows, never for the
    // entire ranking. Recheck privacy after the short aggregate cache, too.
    const identities = await publicUserCards(app.prisma, [...new Set([
      ...top.map((row) => row.userId), ...(mine ? [mine.userId] : []),
    ])], null);
    const dto = (r: WatchRow) => {
      const identity = identities.get(r.userId);
      if (!identity || identity.episodes == null) return null;
      return {
        userId: r.userId,
        displayName: identity.displayName,
        username: identity.username,
        avatarUrl: identity.avatarUrl,
        avatarFrame: identity.avatarFrame,
        isPro: identity.isPro,
        weeklyWatchPlace: identity.weeklyWatchPlace,
        monthlyWatchPlace: identity.monthlyWatchPlace,
        profileTitle: identity.profileTitle,
        titlePrefix: identity.titlePrefix,
        titleIcon: identity.titleIcon,
        episodes: identity.episodes,
        xp: identity.xp,
        rank: Number(r.rank), seconds: Number(r.seconds), titles: Number(r.titles),
      };
    };
    return {
      period,
      top: top.map(dto).filter((row) => row != null),
      me: mine ? dto(mine) : null,
      week: {
        startsAt: week.start.toISOString(),
        endsAt: week.end.toISOString(),
        proDays: WEEKLY_PRO_DAYS,
      },
    };
  });
};
