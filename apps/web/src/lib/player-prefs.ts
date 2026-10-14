import { useCallback, useState } from "react";

/** What the player does on its own, as the viewer set it. Kept per browser. */
export interface PlayerPrefs {
  /** Jump over the opening when the player reaches it. */
  skipOpening: boolean;
  /** At the ending: go on to the next episode (or past the credits). */
  skipEnding: boolean;
  /** When an episode ends, start the next one. */
  autoNext: boolean;
  /** Start an episode where it was left off. */
  resume: boolean;
}

const KEY = "as:player-prefs.v1";
/** The old single switch, still honoured for autoNext. */
const LEGACY_AUTO_NEXT = "as:auto-next";

const DEFAULTS: PlayerPrefs = { skipOpening: false, skipEnding: false, autoNext: true, resume: true };

function read(): PlayerPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PlayerPrefs>) };
    return { ...DEFAULTS, autoNext: localStorage.getItem(LEGACY_AUTO_NEXT) !== "0" };
  } catch {
    return DEFAULTS;
  }
}

/** What a guest's player does: nothing on its own — these are for members. */
const LOCKED: PlayerPrefs = { skipOpening: false, skipEnding: false, autoNext: false, resume: false };

/**
 * The prefs, and a way to flip one. `enabled` false (a guest): all off,
 * nothing can be switched on, nothing is written to the browser.
 */
export function usePlayerPrefs(enabled = true) {
  const [stored, setPrefs] = useState<PlayerPrefs>(read);
  const prefs = enabled ? stored : LOCKED;
  const toggle = useCallback((key: keyof PlayerPrefs) => {
    if (!enabled) return;
    setPrefs((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private browsing, blocked storage — it just won't stick.
      }
      return next;
    });
  }, [enabled]);
  return { prefs, toggle };
}
