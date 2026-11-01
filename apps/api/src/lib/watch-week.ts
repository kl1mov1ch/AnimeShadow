export const WEEK_MS = 7 * 86_400_000;
const MOSCOW_OFFSET = 3 * 3_600_000;
export const WEEKLY_PRO_DAYS = [7, 5, 3] as const;

/** Moscow has no daylight-saving transitions: Monday 00:00 MSK = Sunday 21:00 UTC. */
export function watchWeek(now = new Date()) {
  const local = new Date(now.getTime() + MOSCOW_OFFSET);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  const start = new Date(local.getTime() - MOSCOW_OFFSET);
  return { start, end: new Date(start.getTime() + WEEK_MS) };
}
