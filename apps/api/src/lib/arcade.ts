import { createHash } from "node:crypto";

export function moscowDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function nextDailyReset(day: string): string {
  return `${day}T21:00:00.000Z`;
}

/** A stable shuffle makes the day's selection independent of which process creates it. */
export function dailyShuffle<T>(items: T[], day: string): T[] {
  return items
    .map((item, i) => ({
      item,
      key: createHash("sha256").update(`${day}:${i}`).digest("hex"),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ item }) => item);
}

/** Serialise a player's score writes; unrelated players continue independently. */
export function playerQueue() {
  const pending = new Map<string, Promise<unknown>>();
  return async <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const previous = pending.get(key) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(run);
    pending.set(key, task);
    try {
      return await task;
    } finally {
      if (pending.get(key) === task) pending.delete(key);
    }
  };
}
