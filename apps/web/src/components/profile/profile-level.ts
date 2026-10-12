/**
 * The profile level lives in @animeshadow/shared (levels.ts), so the page
 * and the server count it the same way — the server checks it before a
 * level-locked frame or title can be worn.
 */
export {
  earnedSources,
  LEVEL_TIERS,
  type LevelInfo,
  levelForXp,
  levelOf,
  type LevelTier,
  MAX_LEVEL,
  tierFor,
  type XpSource,
  xpForLevel,
} from "@animeshadow/shared";

/** Scrolls to a block of the profile, below the sticky header and the tabs. */
export function jumpTo(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
}
