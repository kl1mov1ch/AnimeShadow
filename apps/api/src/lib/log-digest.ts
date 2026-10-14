import { appendFile, mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * The server's log, gathered: instead of a line per request, one line per
 * hour — how many requests, by status, which routes were busiest and
 * slowest, which errors came up and how often. Kept in one file per day
 * (`digest-YYYY-MM-DD.jsonl`) in LOG_DIR; files older than LOG_KEEP_DAYS
 * are deleted. All of it is counted in memory on the request that was
 * happening anyway — nothing touches the database.
 */

export interface DigestRoute {
  route: string;
  count: number;
  avgMs: number;
  maxMs: number;
  errors: number;
}

export interface DigestHour {
  /** Start of the hour, ISO. */
  hour: string;
  requests: number;
  status: Record<string, number>;
  avgMs: number;
  /** The busiest routes (top 15). */
  routes: DigestRoute[];
  /** Errors by message, most frequent first (top 10). */
  errors: Array<{ message: string; count: number; route: string }>;
}

interface Bucket {
  hour: number;
  requests: number;
  totalMs: number;
  status: Map<string, number>;
  routes: Map<string, { count: number; totalMs: number; maxMs: number; errors: number }>;
  errors: Map<string, { count: number; route: string }>;
}

const HOUR = 3_600_000;

export class LogDigest {
  private bucket: Bucket;

  constructor(
    private readonly dir: string,
    private readonly keepDays: number,
  ) {
    this.bucket = this.fresh(Date.now());
  }

  private fresh(now: number): Bucket {
    return { hour: Math.floor(now / HOUR) * HOUR, requests: 0, totalMs: 0, status: new Map(), routes: new Map(), errors: new Map() };
  }

  /** One finished response. */
  record(route: string, status: number, ms: number): void {
    this.roll();
    const b = this.bucket;
    b.requests += 1;
    b.totalMs += ms;
    const cls = `${Math.floor(status / 100)}xx`;
    b.status.set(cls, (b.status.get(cls) ?? 0) + 1);
    const r = b.routes.get(route) ?? { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    r.count += 1;
    r.totalMs += ms;
    r.maxMs = Math.max(r.maxMs, ms);
    if (status >= 500) r.errors += 1;
    b.routes.set(route, r);
  }

  /** An error worth knowing about (a 5xx, or anything unhandled). */
  error(message: string, route: string): void {
    this.roll();
    const key = message.slice(0, 200);
    const e = this.bucket.errors.get(key) ?? { count: 0, route };
    e.count += 1;
    this.bucket.errors.set(key, e);
  }

  /** The hour that is still being counted. */
  current(): DigestHour {
    return this.summarise(this.bucket);
  }

  private summarise(b: Bucket): DigestHour {
    return {
      hour: new Date(b.hour).toISOString(),
      requests: b.requests,
      status: Object.fromEntries(b.status),
      avgMs: b.requests ? Math.round(b.totalMs / b.requests) : 0,
      routes: [...b.routes.entries()]
        .sort((a, c) => c[1].count - a[1].count)
        .slice(0, 15)
        .map(([route, r]) => ({ route, count: r.count, avgMs: Math.round(r.totalMs / r.count), maxMs: Math.round(r.maxMs), errors: r.errors })),
      errors: [...b.errors.entries()]
        .sort((a, c) => c[1].count - a[1].count)
        .slice(0, 10)
        .map(([message, e]) => ({ message, count: e.count, route: e.route })),
    };
  }

  /** A new hour started: the old one goes to the file. */
  private roll(): void {
    const now = Date.now();
    if (now - this.bucket.hour < HOUR) return;
    const done = this.bucket;
    this.bucket = this.fresh(now);
    void this.write(done);
  }

  /** Writes the hour being counted now (on shutdown). */
  async flush(): Promise<void> {
    await this.write(this.bucket);
    this.bucket = this.fresh(Date.now());
  }

  private async write(b: Bucket): Promise<void> {
    if (b.requests === 0 && b.errors.size === 0) return;
    try {
      await mkdir(this.dir, { recursive: true });
      const day = new Date(b.hour).toISOString().slice(0, 10);
      await appendFile(join(this.dir, `digest-${day}.jsonl`), `${JSON.stringify(this.summarise(b))}\n`);
    } catch {
      // A full or read-only disk must not take the API down with it.
    }
  }

  /** Deletes digest files older than the keep window. Returns how many went. */
  async prune(): Promise<number> {
    const cutoff = new Date(Date.now() - this.keepDays * 86_400_000).toISOString().slice(0, 10);
    let removed = 0;
    for (const f of await this.files()) {
      if (f.day < cutoff) {
        await unlink(join(this.dir, f.name)).catch(() => undefined);
        removed += 1;
      }
    }
    return removed;
  }

  async files(): Promise<Array<{ name: string; day: string; bytes: number }>> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const out: Array<{ name: string; day: string; bytes: number }> = [];
    for (const name of names) {
      const m = /^digest-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
      if (!m) continue;
      const info = await stat(join(this.dir, name)).catch(() => null);
      if (info) out.push({ name, day: m[1]!, bytes: info.size });
    }
    return out.sort((a, b) => b.day.localeCompare(a.day));
  }

  /** The last `hours` hours: from the files, plus the hour in progress. */
  async recent(hours: number): Promise<DigestHour[]> {
    const since = Date.now() - hours * HOUR;
    const out: DigestHour[] = [];
    for (const f of (await this.files()).slice(0, Math.ceil(hours / 24) + 1)) {
      const text = await readFile(join(this.dir, f.name), "utf8").catch(() => "");
      for (const line of text.split("\n")) {
        if (!line) continue;
        try {
          const h = JSON.parse(line) as DigestHour;
          if (Date.parse(h.hour) >= since) out.push(h);
        } catch {
          // A torn last line from a crash — skipped.
        }
      }
    }
    out.push(this.current());
    return out.sort((a, b) => b.hour.localeCompare(a.hour));
  }
}
