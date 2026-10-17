import type { SkipSegmentRaw } from "@animeshadow/shared";

export interface SkipSegment {
  kind: "op" | "ed" | "recap";
  start: number;
  stop: number;
  /**
   * Marked on a copy of the same length (within a few seconds) or given by
   * the provider itself — safe to skip without asking. Otherwise only the
   * button is offered.
   */
  exact: boolean;
}

/** Same length within this: the same cut, the same times. */
const SAME_CUT_S = 4;
/** Further than this apart: a different cut altogether — not used at all. */
const MAX_DRIFT_S = 45;

export const SEGMENT_LABEL: Record<SkipSegment["kind"], string> = {
  op: "опенинг",
  ed: "эндинг",
  recap: "пересказ",
};

/**
 * AniSkip's times, fitted to the copy actually playing. AniSkip keeps the
 * best-voted times per episode length; of each kind the one marked on the
 * closest length is taken:
 *  - the same length (±4 s): exact, auto-skip is allowed;
 *  - a little off (a studio card, a dub's own intro): the ending is moved by
 *    the difference (it sits at the end), the opening and recap are kept —
 *    either way shown only as a button, never skipped by itself;
 *  - further off, or no length known yet: nothing (or, unknown length,
 *    the buttons only).
 * A provider's own opening (AniLibria marks it) wins over AniSkip's.
 */
export function fitSegments(
  raw: SkipSegmentRaw[] | undefined,
  duration: number,
  providerOpening?: { start: number; stop: number } | null,
): SkipSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const out: SkipSegment[] = [];
  const validOpening = providerOpening && Number.isFinite(providerOpening.start) && Number.isFinite(providerOpening.stop) && providerOpening.start >= 0 && providerOpening.stop > providerOpening.start && providerOpening.stop <= duration ? providerOpening : null;
  if (validOpening) out.push({ kind: "op", ...validOpening, exact: true });
  for (const kind of ["op", "ed", "recap"] as const) {
    if (kind === "op" && validOpening) continue;
    const candidates = (raw ?? []).filter((s) => s.kind === kind && Number.isFinite(s.start) && Number.isFinite(s.stop) && s.start >= 0 && s.stop > s.start && Number.isFinite(s.length) && s.length >= 0);
    if (candidates.length === 0) continue;
    const best = candidates.reduce((a, b) =>
      Math.abs((b.length || duration) - duration) < Math.abs((a.length || duration) - duration) ? b : a,
    );
    const drift = best.length > 0 ? duration - best.length : 0;
    if (Math.abs(drift) > MAX_DRIFT_S) continue;
    const exact = best.length > 0 && Math.abs(drift) <= SAME_CUT_S;
    const shift = kind === "ed" && !exact ? drift : 0;
    const start = Math.max(0, best.start + shift);
    const stop = Math.min(duration, best.stop + shift);
    if (stop - start >= 5) out.push({ kind, start, stop, exact });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The part playing at `time`, if any. */
export function segmentAt(segments: SkipSegment[], time: number): SkipSegment | null {
  return segments.find((s) => time >= s.start && time < s.stop - 1.5) ?? null;
}
