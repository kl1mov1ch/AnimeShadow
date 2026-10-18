export type SavedEpisodeState = {
  completed: boolean;
  position: number;
  duration?: number | null;
};
export const episodeProgressKey = (animeId: number, ownerId?: string | null) =>
  ["anime", animeId, "progress", ownerId ?? null] as const;
export function runtimeSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const hours = /([\d.]+)\s*(?:час|ч\b|hours?|hr\b)/i.exec(value);
  const minutes = /([\d.]+)\s*(?:мин|min)/i.exec(value);
  const seconds = /([\d.]+)\s*(?:сек|sec)/i.exec(value);
  const total =
    Number(hours?.[1] ?? 0) * 3600 +
    Number(minutes?.[1] ?? 0) * 60 +
    Number(seconds?.[1] ?? 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}
/** Personal progress cannot be inferred from an arbitrary typical episode length. */
export function episodeProgress(
  state: SavedEpisodeState | undefined,
  authenticated: boolean,
  duration?: number | null,
) {
  if (!authenticated || !state) return { fraction: 0, position: 0, completed: false };
  const position = Number.isFinite(state.position) ? Math.max(0, state.position) : 0;
  const length = state.duration && state.duration > 0 ? state.duration : duration;
  return {
    position,
    completed: state.completed,
    fraction: state.completed
      ? 1
      : length && Number.isFinite(length) && length > 0
        ? Math.min(1, position / length)
        : 0,
  };
}
