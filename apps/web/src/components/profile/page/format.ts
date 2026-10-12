/** "1 серия", "3 серии", "7 серий". */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** "только что", "5 мин назад", "3 ч назад", "вчера", "4 дня назад", then a date. */
export function ago(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return "вчера";
  if (d < 7) return `${d} ${plural(d, "день", "дня", "дней")} назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined });
}

/** The day an event belongs to, as a heading: "Сегодня", "Вчера", "12 октября". */
export function dayHeading(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(today) - start(date)) / 86_400_000);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** Library statuses in the order a list is read, with their colour. */
export const STATUS_ORDER = ["WATCHING", "COMPLETED", "PLANNED", "ON_HOLD", "DROPPED"] as const;
export type ListStatus = (typeof STATUS_ORDER)[number];

export const STATUS_COLOR: Record<ListStatus, string> = {
  WATCHING: "#34d399",
  COMPLETED: "#60a5fa",
  PLANNED: "#a78bfa",
  ON_HOLD: "#fbbf24",
  DROPPED: "#f87171",
};
