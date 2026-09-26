import { TtlCache } from "./cache.js";

export interface SkipInterval {
  start: number;
  stop: number;
}

export interface SkipTimes {
  opening: SkipInterval | null;
  ending: SkipInterval | null;
}

const NONE: SkipTimes = { opening: null, ending: null };

/** A day: timestamps are crowd-submitted and rarely change. */
const cache = new TtlCache<SkipTimes>(24 * 60 * 60_000, 5000);

/**
 * Where the opening and ending sit in one episode, from AniSkip — a public,
 * crowd-sourced database of skip times keyed by MyAnimeList id (which is
 * what our anime ids are). Used where the provider itself published none.
 * Any failure is just "unknown": the player simply won't skip.
 */
export async function fetchSkipTimes(malId: number, episode: number): Promise<SkipTimes> {
  return cache.wrap(`${malId}:${episode}`, async () => {
    try {
      const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types[]=op&types[]=ed&episodeLength=0`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
      if (!res.ok) return NONE;
      const body = (await res.json()) as {
        found?: boolean;
        results?: Array<{ skipType: string; interval: { startTime: number; endTime: number } }>;
      };
      if (!body.found || !Array.isArray(body.results)) return NONE;
      const pick = (type: string): SkipInterval | null => {
        const hit = body.results!.find((r) => r.skipType === type);
        if (!hit) return null;
        const start = Math.max(0, Math.round(hit.interval.startTime));
        const stop = Math.round(hit.interval.endTime);
        return stop > start ? { start, stop } : null;
      };
      return { opening: pick("op"), ending: pick("ed") };
    } catch {
      return NONE;
    }
  });
}
