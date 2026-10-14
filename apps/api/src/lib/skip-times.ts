import type { SkipSegmentRaw } from "@animeshadow/shared";
import { TtlCache } from "./cache.js";

export interface SkipInterval {
  start: number;
  stop: number;
}

export interface SkipTimes {
  /** The best guess without knowing the episode's length (kept for callers that don't). */
  opening: SkipInterval | null;
  ending: SkipInterval | null;
  /** Every marked part with the episode length it was marked on — the player picks the one that fits its copy. */
  segments: SkipSegmentRaw[];
}

const NONE: SkipTimes = { opening: null, ending: null, segments: [] };

/** A day: timestamps are crowd-submitted and rarely change. */
const cache = new TtlCache<SkipTimes>(24 * 60 * 60_000, 5000);

const KIND: Record<string, SkipSegmentRaw["kind"]> = { op: "op", "mixed-op": "op", ed: "ed", "mixed-ed": "ed", recap: "recap" };

/**
 * Where the opening, ending and recap sit in one episode, from AniSkip — a
 * public, crowd-sourced database of skip times keyed by MyAnimeList id
 * (which is what our anime ids are). AniSkip keeps the best-voted times
 * for each episode *length* it has seen (TV cut, a longer BD cut, a version
 * with a studio card in front): all of them are returned with their length,
 * and the player keeps the one that matches the copy it is actually
 * playing. Any failure is just "unknown": the player simply won't skip.
 */
export async function fetchSkipTimes(malId: number, episode: number): Promise<SkipTimes> {
  return cache.wrap(`v2:${malId}:${episode}`, async () => {
    try {
      const types = ["op", "ed", "mixed-op", "mixed-ed", "recap"].map((t) => `types[]=${t}`).join("&");
      const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${types}&episodeLength=0`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
      if (!res.ok) return NONE;
      const body = (await res.json()) as {
        found?: boolean;
        results?: Array<{ skipType: string; episodeLength?: number; interval: { startTime: number; endTime: number } }>;
      };
      if (!body.found || !Array.isArray(body.results)) return NONE;
      const segments: SkipSegmentRaw[] = [];
      for (const r of body.results) {
        const kind = KIND[r.skipType];
        const start = Math.max(0, Math.round(r.interval.startTime * 10) / 10);
        const stop = Math.round(r.interval.endTime * 10) / 10;
        if (kind && stop > start) segments.push({ kind, start, stop, length: Math.round(r.episodeLength ?? 0) });
      }
      const first = (kind: SkipSegmentRaw["kind"]) => {
        const hit = segments.find((s) => s.kind === kind);
        return hit ? { start: Math.round(hit.start), stop: Math.round(hit.stop) } : null;
      };
      return { opening: first("op"), ending: first("ed"), segments };
    } catch {
      return NONE;
    }
  });
}
