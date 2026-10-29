import { useSyncExternalStore } from "react";
import type { SavedEpisodeState } from "@/lib/episode-progress";

/**
 * How far into each episode this browser got — kept on the device, written
 * as the picture plays, read by the episode list beside the player.
 *
 * The server still gets its save every half minute (signed-in viewers); this
 * is what makes the list move *now*, for guests too, without one more
 * request: the bar under the episode you're on grows while you watch.
 *
 * One small JSON entry per title ([position, duration, completed, at] per
 * episode), the last 60 titles kept.
 */
type Row = [position: number, duration: number, completed: 0 | 1, at: number];
type Title = Record<string, Row>;

const PREFIX = "as:ep-progress:";
const INDEX = "as:ep-progress:index";
const KEEP_TITLES = 60;
/** At least this much playback between two writes of the same episode. */
const WRITE_STEP = 5;
const COMPLETE_AT = 0.9;

const cache = new Map<number, Title>();
const listeners = new Map<number, Set<() => void>>();
const snapshots = new Map<number, Map<number, LocalEpisodeState>>();

export interface LocalEpisodeState extends SavedEpisodeState {
  at: number;
}

function read(animeId: number): Title {
  const hit = cache.get(animeId);
  if (hit) return hit;
  let title: Title = {};
  try {
    const raw = localStorage.getItem(PREFIX + animeId);
    if (raw) title = JSON.parse(raw) as Title;
  } catch {
    // Blocked storage or a damaged entry: start empty.
  }
  cache.set(animeId, title);
  return title;
}

function persist(animeId: number, title: Title) {
  try {
    localStorage.setItem(PREFIX + animeId, JSON.stringify(title));
    const index = (JSON.parse(localStorage.getItem(INDEX) ?? "[]") as number[]).filter((id) => id !== animeId);
    index.unshift(animeId);
    for (const old of index.splice(KEEP_TITLES)) localStorage.removeItem(PREFIX + old);
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    // Private mode or a full disk: the list still moves for this visit.
  }
}

function emit(animeId: number) {
  snapshots.delete(animeId);
  for (const listener of listeners.get(animeId) ?? []) listener();
}

/** The player's clock, every timeupdate — written only every few seconds. */
export function recordLocalProgress(animeId: number, episode: number, position: number, duration: number, force = false) {
  if (!(animeId > 0) || !(episode > 0) || !Number.isFinite(position) || position < 0) return;
  const title = read(animeId);
  const key = String(episode);
  const before = title[key];
  const length = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : before?.[1] ?? 0;
  const completed: 0 | 1 = before?.[2] === 1 || (length > 0 && position / length >= COMPLETE_AT) ? 1 : 0;
  if (!force && before && Math.abs(before[0] - position) < WRITE_STEP && before[2] === completed) return;
  title[key] = [Math.floor(position), length, completed, Date.now()];
  persist(animeId, title);
  emit(animeId);
}

/** A tick by hand (or its removal) — mirrored here so the list agrees at once. */
export function markLocalEpisode(animeId: number, episode: number, completed: boolean) {
  const title = read(animeId);
  const before = title[String(episode)];
  title[String(episode)] = [before?.[0] ?? 0, before?.[1] ?? 0, completed ? 1 : 0, Date.now()];
  persist(animeId, title);
  emit(animeId);
}

function snapshot(animeId: number): Map<number, LocalEpisodeState> {
  const hit = snapshots.get(animeId);
  if (hit) return hit;
  const map = new Map<number, LocalEpisodeState>();
  for (const [key, [position, duration, completed, at]] of Object.entries(read(animeId))) {
    const n = Number(key);
    if (Number.isInteger(n) && n > 0) map.set(n, { position, duration: duration || null, completed: completed === 1, at });
  }
  snapshots.set(animeId, map);
  return map;
}

const EMPTY = new Map<number, LocalEpisodeState>();

export function useLocalProgress(animeId: number): Map<number, LocalEpisodeState> {
  return useSyncExternalStore(
    (listener) => {
      let set = listeners.get(animeId);
      if (!set) listeners.set(animeId, (set = new Set()));
      set.add(listener);
      return () => set!.delete(listener);
    },
    () => (animeId > 0 ? snapshot(animeId) : EMPTY),
    () => EMPTY,
  );
}

/**
 * The server's rows and this device's, episode by episode: whichever was
 * touched last wins the position; "watched" from either side stays watched.
 */
export function mergeProgress(
  server: Map<number, SavedEpisodeState & { at?: number }>,
  local: Map<number, LocalEpisodeState>,
): Map<number, SavedEpisodeState> {
  if (local.size === 0) return server;
  const merged = new Map<number, SavedEpisodeState>(server);
  for (const [n, row] of local) {
    const remote = server.get(n);
    if (!remote) {
      merged.set(n, row);
      continue;
    }
    const newer = (remote.at ?? 0) < row.at;
    merged.set(n, {
      completed: remote.completed || row.completed,
      position: newer ? row.position : remote.position,
      duration: (newer ? row.duration : remote.duration) ?? remote.duration ?? row.duration,
    });
  }
  return merged;
}
