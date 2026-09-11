/**
 * Deterministic "randomness" keyed by a string (typically a date + user id).
 * Same key -> same order, so a recommendation rail is stable across a page's
 * lifetime and repeat visits within the same day, but rotates once the key's
 * date component changes — "always a choice, never frozen on one pick."
 */

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], key: string): T[] {
  const rand = mulberry32(hashSeed(key));
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]] as [T, T];
  }
  return arr;
}

/** UTC calendar day, e.g. "2026-09-11" — the rotation clock. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
