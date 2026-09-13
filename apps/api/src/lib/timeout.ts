/** Resolve `p`, or `fallback` if it takes longer than `ms`. The slow promise
 * keeps running in the background (nothing here cancels it) — this only
 * stops it from holding up the caller's own response. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
