import type { PrismaClient } from "@animeshadow/db";
import type { AdminDailyRow } from "@animeshadow/shared";
import { STATS_TZ, type StatsRollupService } from "../services/stats-rollup.service.js";

/**
 * Attendance by day from StatDay — two small rows per day, so a year of it
 * is a few hundred rows read, nothing scanned. Today is recounted first
 * (throttled, see StatsRollupService.refreshToday).
 */
export async function dailyAttendance(prisma: PrismaClient, rollup: StatsRollupService, days: number): Promise<AdminDailyRow[]> {
  await rollup.refreshToday().catch(() => undefined);
  const rows = await prisma.$queryRaw<
    Array<{
      day: string;
      today: boolean;
      pageviews: number;
      visitors: number;
      fresh: number;
      reg: number;
      guest: number;
      sessions: number;
      bounces: number;
      sec: number;
      regs: number;
      watch: number;
    }>
  >`
    SELECT to_char(day, 'YYYY-MM-DD') AS day,
      day = (now() AT TIME ZONE ${STATS_TZ})::date AS today,
      SUM(pageviews)::int AS pageviews,
      SUM(visitors)::int AS visitors,
      SUM("newVisitors")::int AS fresh,
      SUM(visitors) FILTER (WHERE audience = 'registered')::int AS reg,
      SUM(visitors) FILTER (WHERE audience = 'guest')::int AS guest,
      SUM(sessions)::int AS sessions,
      SUM(bounces)::int AS bounces,
      SUM("sessionSec")::int AS sec,
      SUM(registrations)::int AS regs,
      SUM("watchSec")::int AS watch
    FROM "StatDay"
    WHERE day > (now() AT TIME ZONE ${STATS_TZ})::date - ${days}::int
    GROUP BY day
    ORDER BY day DESC
  `;
  return rows.map((r) => ({
    day: r.day,
    visitors: r.visitors,
    newVisitors: Math.min(r.fresh, r.visitors),
    returning: Math.max(0, r.visitors - r.fresh),
    registeredVisitors: r.reg ?? 0,
    guestVisitors: r.guest ?? 0,
    pageviews: r.pageviews,
    repeatViews: Math.max(0, r.pageviews - r.visitors),
    sessions: r.sessions,
    bounces: r.bounces,
    avgSessionSec: r.sessions > 0 ? Math.round(r.sec / r.sessions) : 0,
    registrations: r.regs,
    watchMinutes: Math.round(r.watch / 60),
    live: r.today,
  }));
}
