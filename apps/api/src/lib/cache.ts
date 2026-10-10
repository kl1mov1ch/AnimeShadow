/**
 * Tiny single-value / keyed TTL cache for cross-request reuse of expensive
 * aggregate reads (see `server-cache-lru` guidance). Not an LRU — entries are
 * few and coarse — but it bounds size and expires by wall clock.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 64,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Forget one key, so the next read recomputes it. */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Get-or-compute, sharing one in-flight promise per key (stampede guard). */
  async wrap(key: string, produce: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const promise = produce()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => this.pending.delete(key));

    this.pending.set(key, promise);
    return promise;
  }

  private readonly pending = new Map<string, Promise<T>>();
}

/**
 * Stale-while-revalidate: an answer stays servable for `keepMs`, but once
 * it is older than `freshMs` the next read starts a refresh — in the
 * background, through `refresh` — and is answered from the old copy
 * meanwhile. Only a key never seen (or long forgotten) makes its caller
 * wait for `produce`.
 */
export class SwrCache<T> {
  private readonly store = new Map<string, { value: T; at: number }>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(
    private readonly freshMs: number,
    private readonly keepMs: number,
    private readonly maxEntries = 500,
  ) {}

  async get(
    key: string,
    produce: () => Promise<T>,
    refresh: (load: () => Promise<T>) => Promise<T> = (load) => load(),
  ): Promise<T> {
    const hit = this.store.get(key);
    const age = hit ? Date.now() - hit.at : Number.POSITIVE_INFINITY;
    if (hit && age < this.keepMs) {
      if (age > this.freshMs && !this.pending.has(key)) {
        void refresh(() => this.load(key, produce)).catch(() => undefined);
      }
      return hit.value;
    }
    return this.load(key, produce);
  }

  /** Whether `key` has an answer that hasn't gone stale yet. */
  isFresh(key: string): boolean {
    const hit = this.store.get(key);
    return hit != null && Date.now() - hit.at < this.freshMs;
  }

  private load(key: string, produce: () => Promise<T>): Promise<T> {
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const promise = produce()
      .then((value) => {
        // Re-inserted at the end, so the oldest-used key is the one evicted.
        this.store.delete(key);
        if (this.store.size >= this.maxEntries) {
          const oldest = this.store.keys().next().value;
          if (oldest !== undefined) this.store.delete(oldest);
        }
        this.store.set(key, { value, at: Date.now() });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
