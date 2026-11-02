const MOSCOW_OFFSET_MS = 3 * 3_600_000;
export const MONTHLY_AWARD_GRACE_MS = 120_000;

/** Calendar month in Moscow, including varying month lengths and leap years. */
export function watchMonth(now = new Date()) {
  const local = new Date(now.getTime() + MOSCOW_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - MOSCOW_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - MOSCOW_OFFSET_MS),
  };
}
