import { useSyncExternalStore } from "react";

/**
 * Where the player on the page is: which title, which episode, which second.
 * The player writes it as it plays; the comment box reads it to tie a
 * comment to the moment ("на 14:20 третьей серии"). Nothing is stored.
 */
interface Clock {
  animeId: number;
  episode: number;
  time: number;
}

let clock: Clock | null = null;
const listeners = new Set<() => void>();
let lastEmit = 0;

export function publishClock(animeId: number, episode: number, time: number) {
  if (!Number.isFinite(time) || time < 0) return;
  clock = { animeId, episode, time };
  // A second's precision is plenty for whoever is listening.
  const now = Date.now();
  if (now - lastEmit < 1000) return;
  lastEmit = now;
  for (const l of listeners) l();
}

export function usePlayerClock(animeId: number): { episode: number; time: number } | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (clock && clock.animeId === animeId ? clock : null),
    () => null,
  );
}

export interface JumpDetail {
  episode: number;
  seconds: number;
}

/** "Go there": the player on the page moves to this moment (another episode if need be) and comes into view. */
export function jumpTo(episode: number, seconds: number) {
  window.dispatchEvent(new CustomEvent<JumpDetail>("as:jump", { detail: { episode, seconds } }));
  document.getElementById("watch")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
