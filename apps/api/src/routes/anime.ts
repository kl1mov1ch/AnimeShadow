import { ANIME_WITH_GENRES_INCLUDE, toSummaryDto } from "@animeshadow/db";
import { animeQuerySchema, localeQuerySchema, type WatchResponse } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import { NotFoundError } from "../lib/errors.js";
import { fetchSkipTimes } from "../lib/skip-times.js";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.coerce.number().int().positive() });
const slugParams = z.object({ slug: z.string().min(1).max(120) });
const rollQuery = z.object({ count: z.coerce.number().int().min(1).max(14).default(14) });
/**
 * The ids the header's random pick draws from — a few thousand rows that
 * change only when the catalogue does, so they are read once per ten
 * minutes instead of on every press of the button.
 */
const rollPool = new TtlCache<number[]>(10 * 60_000, 4);

/**
 * The watch payload as the page needs it. Every Kodik dub carried five
 * screenshot links per episode, and the page shows only one still per
 * episode, taken from the first dub that has any — so a title with 40 dubs
 * and 28 episodes answered with 380 KB, 90% of it links nobody loads. One
 * still per episode, on the first dub that has it; the result is kept per
 * cached response, so it is worked out once, not on every request.
 */
const slimmed = new WeakMap<WatchResponse, WatchResponse>();
function slimWatch(response: WatchResponse): WatchResponse {
  const hit = slimmed.get(response);
  if (hit) return hit;
  const withStill = new Set<string>();
  const out: WatchResponse = {
    ...response,
    sources: response.sources.map((source) => {
      if (!source.iframeEpisodes) return source;
      const episodes: NonNullable<typeof source.iframeEpisodes> = {};
      for (const [n, episode] of Object.entries(source.iframeEpisodes)) {
        const first = episode.thumbs.length > 0 && !withStill.has(n);
        if (first) withStill.add(n);
        episodes[n] = { url: episode.url, thumbs: first ? episode.thumbs.slice(0, 1) : [] };
      }
      return { ...source, iframeEpisodes: episodes };
    }),
  };
  slimmed.set(response, out);
  return out;
}

export const animeRoutes: FastifyPluginAsync = async (fastify) => {
  const { catalog, watch, episodeInfo } = fastify.services;

  fastify.get(
    "/anime",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const query = parse(animeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      return catalog.browse(query, allowAdult, request.userId);
    },
  );

  // A random title out of the catalogue's current filters.
  fastify.get(
    "/anime/random-from",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const query = parse(animeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      const pick = await catalog.randomFrom(query, allowAdult, request.userId);
      if (!pick) throw new NotFoundError("По этим фильтрам ничего нет.");
      return pick;
    },
  );

  fastify.get("/studios", async (request) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(60) }), request.query);
    return { items: await catalog.studios(q) };
  });

  // A random well-rated title — powers the "surprise me" action.
  fastify.get(
    "/anime/random",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      // Only what can actually be watched here: a random title that then
      // says "no player" is a dead end, not a surprise.
      const pool = await fastify.prisma.anime.findMany({
        where: {
          AND: [
            { score: { gte: 7 }, imageUrl: { not: null }, watchAvailability: { hasPlayer: true } },
            contentGuardWhere(allowAdult),
          ],
        },
        select: { id: true, slug: true },
      });
      if (pool.length === 0) throw new NotFoundError("Каталог пуст.");
      const pick = pool[Math.floor(Math.random() * pool.length)]!;
      return { id: pick.id, slug: pick.slug };
    },
  );

  /**
   * The header's roulette: a strip of random titles to spin past and the
   * one it lands on. All of them have a player and a poster; the pick is
   * the last of the strip.
   */
  fastify.get(
    "/anime/roll",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { count } = parse(rollQuery, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      const pool = await rollPool.wrap(allowAdult ? "adult" : "safe", async () => {
        const rows = await fastify.prisma.anime.findMany({
          where: {
            AND: [
              { score: { gte: 6.8 }, imageUrl: { not: null }, watchAvailability: { hasPlayer: true } },
              contentGuardWhere(allowAdult),
            ],
          },
          select: { id: true },
        });
        return rows.map((row) => row.id);
      });
      if (pool.length === 0) throw new NotFoundError("Каталог пуст.");
      const ids = new Set<number>();
      while (ids.size < Math.min(count, pool.length)) {
        ids.add(pool[Math.floor(Math.random() * pool.length)]!);
      }
      const rows = await fastify.prisma.anime.findMany({
        where: { id: { in: [...ids] } },
        include: ANIME_WITH_GENRES_INCLUDE,
      });
      const reel = rows.map(toSummaryDto).sort(() => Math.random() - 0.5);
      return { pick: reel[reel.length - 1]!, reel };
    },
  );

  // What each episode is called and what happens in it — see EpisodeInfoService.
  fastify.get("/anime/:id/episodes-info", async (request, reply) => {
    const { id } = parse(idParams, request.params);
    const { lang } = parse(localeQuerySchema, request.query);
    reply.header("cache-control", "public, max-age=600");
    return { episodes: await episodeInfo.get(id, lang) };
  });

  fastify.get(
    "/anime/:id",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const { lang } = parse(localeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      // Views are counted from page visits (AnalyticsService), not here: this
      // also answers the hover prefetch of a card.
      return catalog.getAnimeById(id, lang, allowAdult);
    },
  );

  // ЧПУ: resolve a slug → id, then serve the same detail payload.
  fastify.get(
    "/anime/by-slug/:slug",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { slug } = parse(slugParams, request.params);
      const { lang } = parse(localeQuerySchema, request.query);
      const row = await fastify.prisma.anime.findFirst({
        where: { slug },
        select: { id: true },
        orderBy: { members: "desc" },
      });
      if (!row) throw new NotFoundError("Аниме не найдено.");
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      return catalog.getAnimeById(row.id, lang, allowAdult);
    },
  );

  fastify.get("/anime/:id/characters", async (request) => {
    const { id } = parse(idParams, request.params);
    return { items: await catalog.getCharacters(id) };
  });

  fastify.get("/characters/:id", async (request) => {
    const { id } = parse(idParams, request.params);
    const { lang } = parse(localeQuerySchema, request.query);
    const detail = await catalog.getCharacterDetail(id, lang);
    if (!detail) throw new NotFoundError("Персонаж не найден.");
    return detail;
  });

  fastify.get("/anime/:id/recommendations", async (request) => {
    const { id } = parse(idParams, request.params);
    return { items: await catalog.getRecommendations(id) };
  });

  fastify.get("/anime/:id/stats", async (request) => {
    const { id } = parse(idParams, request.params);
    return { stats: await catalog.getAnimeStats(id) };
  });


  // Frames of a title for the homepage hero: every screenshot Shikimori has,
  // fetched once an hour; browsers keep the answer six hours.
  fastify.get("/anime/:id/frames", async (request, reply) => {
    const { id } = parse(idParams, request.params);
    reply.header("cache-control", "public, max-age=21600");
    // Stills from the newest episodes first (the players' own previews), the
    // catalogue's screenshots only to fill in.
    const fromEpisodes = await fastify.services.watch
      .getSources(id)
      .then((watch) => {
        const byEpisode = new Map<number, string[]>();
        for (const source of watch.sources) {
          for (const [key, ep] of Object.entries(source.iframeEpisodes ?? {})) {
            const n = Number(key);
            if (Number.isInteger(n) && ep.thumbs.length > 0) byEpisode.set(n, [...(byEpisode.get(n) ?? []), ...ep.thumbs]);
          }
          for (const [key, meta] of Object.entries(source.episodeMeta ?? {})) {
            const n = Number(key);
            if (Number.isInteger(n) && meta.thumb) byEpisode.set(n, [...(byEpisode.get(n) ?? []), meta.thumb]);
          }
        }
        // Newest episodes first; two stills from each, until twelve.
        return [...byEpisode.entries()]
          .sort((a, b) => b[0] - a[0])
          // Kodik's full-size stills before AniLibria's small previews.
          .flatMap(([, thumbs]) => [...new Set(thumbs)].sort((x, y) => Number(x.includes("anilibria")) - Number(y.includes("anilibria"))).slice(0, 2))
          .slice(0, 12);
      })
      .catch(() => [] as string[]);
    const frames = fromEpisodes.length >= 4 ? fromEpisodes : [...fromEpisodes, ...(await catalog.heroFrames(id))].slice(0, 12);
    return { frames, fromEpisodes: fromEpisodes.length > 0 };
  });

  fastify.get("/anime/:id/franchise", async (request) => {
    const { id } = parse(idParams, request.params);
    return { items: await catalog.getFranchise(id) };
  });

  // Where the opening and ending are in one episode, for auto-skip.
  fastify.get("/anime/:id/skip-times", async (request, reply) => {
    const { id } = parse(idParams, request.params);
    const { episode } = parse(z.object({ episode: z.coerce.number().int().min(1).max(5000) }), request.query);
    reply.header("cache-control", "public, max-age=86400");
    return fetchSkipTimes(id, episode);
  });

  fastify.get("/anime/:id/watch", async (request) => {
    const { id } = parse(idParams, request.params);
    return slimWatch(await watch.getSources(id));
  });
};
