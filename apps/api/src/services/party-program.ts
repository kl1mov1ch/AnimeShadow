import type { PrismaClient } from "@animeshadow/db";
import { contentGuardWhere } from "../lib/content-guard.js";
import type { WatchService } from "./watch.service.js";

export function episodeDuration(text: string | null): number | null {
  if (!text) return null;
  const hours = /([\d.]+)\s*(?:hours?|hrs?|ч(?:ас)?)/i.exec(text);
  const minutes = /([\d.]+)\s*(?:min|мин)/i.exec(text);
  const value = hours || minutes ? Number(hours?.[1] ?? 0) * 3600 + Number(minutes?.[1] ?? 0) * 60 : /^\d+$/.test(text.trim()) ? Number(text) * 60 : 0;
  return Number.isFinite(value) && value >= 60 && value <= 6 * 3600 ? value : null;
}

/** Never invent episodes or start a broadcast without a real direct source. */
export function createPartyProgram(prisma: PrismaClient, watch: Pick<WatchService, "getSources">) {
  return async (animeId?: number, episode = 1) => {
    const candidates = await prisma.anime.findMany({
      where: { ...(animeId ? { id: animeId } : {}), ...contentGuardWhere(false), airing: { not: "UPCOMING" }, playerSources: { some: { format: { in: ["hls", "mp4"] } } } },
      orderBy: [{ popularity: "asc" }, { id: "asc" }], take: animeId ? 1 : 5,
      select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, episodes: true, duration: true },
    });
    for (const candidate of candidates) {
      try {
        const watchData = await watch.getSources(candidate.id);
        const source = watchData.sources.find((s) => (s.format === "hls" || s.format === "mp4") && s.stable !== false && !!(s.hlsEpisodes ?? s.mediaEpisodes)?.[String(episode)]);
        if (!source) continue;
        const durationSeconds = source.episodeMeta?.[String(episode)]?.durationSeconds ?? episodeDuration(candidate.duration);
        if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds < 60) continue;
        const { duration: _duration, ...anime } = candidate;
        return { anime, episode, durationSeconds, sourceId: source.id, availableEpisodes: Object.keys(source.hlsEpisodes ?? source.mediaEpisodes ?? {}).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).sort((a, b) => a - b) };
      } catch { /* A failed provider does not prevent trying the next real title. */ }
    }
    return null;
  };
}
