/** Fallback estimates only; HLS manifests' encoded bitrate takes precedence. */
export const NEEDED_MBPS: Record<number, number> = { 240: 0.4, 360: 0.7, 480: 1, 720: 2, 1080: 4, 1440: 8, 2160: 16 };

export function requiredMbps(height: number | null, bitrate: number | null, rate = 1): number | null {
  const encoded = bitrate != null && Number.isFinite(bitrate) && bitrate > 0 ? bitrate / 1_000_000 : null;
  const estimated = height != null && height > 0 ? NEEDED_MBPS[height] ?? 2 * (height / 720) ** 2 : null;
  const base = encoded != null ? encoded * 1.2 : estimated;
  return base == null ? null : base * Math.max(0.25, rate);
}
