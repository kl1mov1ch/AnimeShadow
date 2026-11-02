import type { PrismaClient } from "@animeshadow/db";
import type { MonthlyWatchAward } from "@animeshadow/shared";

/** Lowest historical place wins; the most recently granted award wins ties. */
export async function monthlyWatchAwards(
  prisma: Pick<PrismaClient, "monthlyWatchAward">,
  userIds: readonly string[],
): Promise<Map<string, MonthlyWatchAward>> {
  const result = new Map<string, MonthlyWatchAward>();
  if (userIds.length === 0) return result;
  const rows = await prisma.monthlyWatchAward.findMany({
    where: { userId: { in: [...new Set(userIds)] }, place: { gte: 1, lte: 999 } },
    select: { userId: true, place: true, monthStart: true, awardedAt: true },
    orderBy: [{ place: "asc" }, { awardedAt: "desc" }, { monthStart: "desc" }],
  });
  for (const row of rows) {
    if (result.has(row.userId)) continue;
    result.set(row.userId, {
      place: row.place,
      monthStart: row.monthStart.toISOString(),
      awardedAt: row.awardedAt.toISOString(),
    });
  }
  return result;
}
