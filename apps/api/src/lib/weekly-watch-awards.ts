import type { PrismaClient } from "@animeshadow/db";
import type { WeeklyWatchAward } from "@animeshadow/shared";

export interface WeeklyWatchAwards {
  award: WeeklyWatchAward | null;
  places: number[];
}

/** One batched query for profiles/auth or a whole page of social cards. */
export async function weeklyWatchAwards(
  prisma: Pick<PrismaClient, "weeklyWatchReward">,
  userIds: readonly string[],
): Promise<Map<string, WeeklyWatchAwards>> {
  const result = new Map<string, WeeklyWatchAwards>();
  if (userIds.length === 0) return result;
  const rows = await prisma.weeklyWatchReward.findMany({
    where: { userId: { in: [...new Set(userIds)] }, place: { gte: 1, lte: 999 } },
    select: { userId: true, place: true, weekStart: true, awardedAt: true },
    orderBy: [{ place: "asc" }, { awardedAt: "desc" }, { weekStart: "desc" }],
  });
  for (const row of rows) {
    const earned = result.get(row.userId) ?? { award: null, places: [] };
    if (!earned.award) {
      earned.award = {
        place: row.place,
        weekStart: row.weekStart.toISOString(),
        awardedAt: row.awardedAt.toISOString(),
      };
    }
    if (row.place <= 3 && !earned.places.includes(row.place)) earned.places.push(row.place);
    result.set(row.userId, earned);
  }
  return result;
}
