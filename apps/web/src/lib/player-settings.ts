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

/** The picture's look, in percent (100 = untouched). */
export interface PictureSettings {
  brightness: number;
  contrast: number;
  saturation: number;
}

export const PICTURE_DEFAULT: PictureSettings = { brightness: 100, contrast: 100, saturation: 100 };

/** Ready-made looks; the sliders make one's own. */
export const PICTURE_PRESETS: Array<{ id: string; label: string; value: PictureSettings }> = [
  { id: "normal", label: "Обычная", value: PICTURE_DEFAULT },
  { id: "bright", label: "Ярче", value: { brightness: 110, contrast: 104, saturation: 112 } },
  { id: "vivid", label: "Сочные цвета", value: { brightness: 102, contrast: 108, saturation: 135 } },
  { id: "retro", label: "Старое аниме", value: { brightness: 106, contrast: 114, saturation: 122 } },
  { id: "soft", label: "Мягкая", value: { brightness: 103, contrast: 94, saturation: 92 } },
  { id: "night", label: "Ночная", value: { brightness: 86, contrast: 96, saturation: 90 } },
];

/** The CSS filter for the picture, or nothing when it's untouched. */
export function pictureFilter(p: PictureSettings): string | undefined {
  if (p.brightness === 100 && p.contrast === 100 && p.saturation === 100) return undefined;
  return `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%)`;
}

export function presetOf(p: PictureSettings): string | null {
  return (
    PICTURE_PRESETS.find((x) => x.value.brightness === p.brightness && x.value.contrast === p.contrast && x.value.saturation === p.saturation)?.id ?? null
  );
}

export interface PlayerSettings {
  step: number;
  speed: number;
  /** "auto", or a picture height ("1080", "720", "480"). */
  quality: string;
  picture: PictureSettings;
}

const KEY = "as:player-settings.v1";
const DEFAULTS: PlayerSettings = { step: 10, speed: 1, quality: "auto", picture: PICTURE_DEFAULT };
const pct = (v: unknown) => (typeof v === "number" && v >= 50 && v <= 150 ? Math.round(v) : 100);

function read(): PlayerSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PlayerSettings> | null;
    return {
      step: SKIP_STEPS.some((n) => n === raw?.step) ? raw!.step! : DEFAULTS.step,
      speed: SPEEDS.some((n) => n === raw?.speed) ? raw!.speed! : DEFAULTS.speed,
      quality: typeof raw?.quality === "string" && /^(auto|\d{3,4})$/.test(raw.quality) ? raw.quality : DEFAULTS.quality,
      picture: {
        brightness: pct(raw?.picture?.brightness),
        contrast: pct(raw?.picture?.contrast),
        saturation: pct(raw?.picture?.saturation),
      },
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
