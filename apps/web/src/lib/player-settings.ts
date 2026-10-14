import { useSyncExternalStore } from "react";

/**
 * How the viewer likes the picture handled: how far the skip buttons jump,
 * how fast episodes play, and (in our own player) which quality. Set once,
 * remembered in this browser, shared live by both players — change it in
 * one place and every control showing it follows. What the player does on
 * its own (skipping openings, moving on) lives next door, in player-prefs.
 */

/** 85 s is a typical opening: one press clears it where no timings are known. */
export const SKIP_STEPS = [5, 10, 15, 30, 85] as const;
/** Kodik's player accepts 0.25–2; these are the useful stops. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface PlayerSettings {
  step: number;
  speed: number;
  /** "auto", or a picture height ("1080", "720", "480"). */
  quality: string;
}

const KEY = "as:player-settings.v1";
const DEFAULTS: PlayerSettings = { step: 10, speed: 1, quality: "auto" };

function read(): PlayerSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PlayerSettings> | null;
    return {
      step: SKIP_STEPS.some((n) => n === raw?.step) ? raw!.step! : DEFAULTS.step,
      speed: SPEEDS.some((n) => n === raw?.speed) ? raw!.speed! : DEFAULTS.speed,
      quality: typeof raw?.quality === "string" && /^(auto|\d{3,4})$/.test(raw.quality) ? raw.quality : DEFAULTS.quality,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: PlayerSettings = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Off for a guest: their changes last for the page, never written to the browser. */
let persist = false;
export function persistPlayerSettings(on: boolean) {
  persist = on;
}

export function setPlayerSetting(patch: Partial<PlayerSettings>) {
  current = { ...current, ...patch };
  try {
    if (persist) localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private browsing, blocked storage — kept for this page load only.
  }
  for (const listener of listeners) listener();
}

export function usePlayerSettings(): PlayerSettings {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULTS);
}

/** "1,25×", "0,5×" — the site is Russian, and so is its decimal comma. */
export function speedLabel(speed: number): string {
  return `${String(speed).replace(".", ",")}×`;
}
