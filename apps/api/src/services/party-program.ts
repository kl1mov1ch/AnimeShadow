import type { PrismaClient } from "@animeshadow/db";
import { sourceBelongsToStudio, type StudioId } from "@animeshadow/shared";
import { contentGuardWhere } from "../lib/content-guard.js";
import type { WatchService } from "./watch.service.js";
import { PARTY_ANIME_SELECT, partyAnime } from "./party-artwork.js";

export function episodeDuration(text: string | null): number | null {
  if (!text) return null;
  const hours = /([\d.]+)\s*(?:hours?|hrs?|ч(?:ас)?)/i.exec(text);
  const minutes = /([\d.]+)\s*(?:min|мин)/i.exec(text);
  const value = hours || minutes ? Number(hours?.[1] ?? 0) * 3600 + Number(minutes?.[1] ?? 0) * 60 : /^\d+$/.test(text.trim()) ? Number(text) * 60 : 0;
  return Number.isFinite(value) && value >= 60 && value <= 6 * 3600 ? value : null;
}

/** Never invent episodes or start a broadcast without a real direct source. */
export function createPartyProgram(prisma: PrismaClient, watch: Pick<WatchService, "getSources">) {
  return async (animeId?: number, episode = 1, studio?: StudioId | null) => {
    const candidates = await prisma.anime.findMany({
      where: { ...(animeId ? { id: animeId } : { watchAvailability: { hasCustomPlayer: true } }), ...contentGuardWhere(true) },
      orderBy: [{ popularity: "asc" }, { id: "asc" }], take: animeId ? 1 : 5,
      select: { ...PARTY_ANIME_SELECT, duration: true },
    });
    for (const candidate of candidates) {
      try {
        let watchData = await watch.getSources(candidate.id);
        const playable = () => watchData.sources.find((s) => sourceBelongsToStudio(s, studio) && (s.format === "hls" || s.format === "mp4") && !!(s.hlsEpisodes ?? s.mediaEpisodes)?.[String(episode)]);
        // A cold provider may still be resolving after the fast watch response.
        for (let attempt = 0; !playable() && watchData.sourcesPending && attempt < 3; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          watchData = await watch.getSources(candidate.id);
        }
        const source = playable();
        if (!source) continue;
        const durationSeconds = source.episodeMeta?.[String(episode)]?.durationSeconds ?? episodeDuration(candidate.duration);
        const duration = durationSeconds && Number.isFinite(durationSeconds) && durationSeconds >= 60 ? durationSeconds : null;
        const anime = partyAnime(candidate);
        return { anime, episode, durationSeconds: duration, sourceId: source.id, availableEpisodes: Object.keys(source.hlsEpisodes ?? source.mediaEpisodes ?? {}).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).sort((a, b) => a - b) };
      } catch { /* A failed provider does not prevent trying the next real title. */ }
    }
    return null;
  };
}
