import { LEVEL_TIERS, MAX_LEVEL, levelForXp, tierFor, xpForLevel, type LevelInfo } from "@animeshadow/shared";

/** Shared level badge geometry, using only the public aggregate experience. */
export function publicLevelInfo(xp: number | null | undefined): LevelInfo | null {
  if (xp == null || !Number.isFinite(xp)) return null;
  const safe = Math.max(0, xp);
  const level = levelForXp(safe);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(Math.min(MAX_LEVEL, level + 1));
  return {
    level, xp: safe, floor, ceiling,
    progress: level >= MAX_LEVEL ? 1 : Math.min(1, (safe - floor) / Math.max(1, ceiling - floor)),
    tier: tierFor(level),
    nextTier: LEVEL_TIERS.find((tier) => tier.from > level) ?? null,
    sources: [],
  };
}

/** Accounts without a claimed username still have a full public profile. */
export function publicProfileHref(username: string | null | undefined, id: string) {
  return username ? `/profile/${encodeURIComponent(username)}` : `/people/${encodeURIComponent(id)}`;
}
