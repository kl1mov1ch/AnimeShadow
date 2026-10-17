import { ANIME_WITH_GENRES_INCLUDE, toSummaryDto } from "@animeshadow/db";
import { animeQuerySchema, localeQuerySchema, type WatchResponse } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import { NotFoundError } from "../lib/errors.js";
import { fetchSkipTimes } from "../lib/skip-times.js";
import { parse } from "../lib/validation.js";
import { kodikMasterPlaylist } from "../services/kodik-streams.js";
import { sendAnimeVostVideo } from "../lib/video-response.js";

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
 * The watch payload as the page needs it. Kodik's screenshot links are left
 * out altogether: its CDN (solodcdn) resets connections from many viewers'
 * networks, so every one of them was a failed request in the console, and
 * they were most of the payload besides. Episode stills come from AniLibria
 * and Kitsu instead. The result is kept per cached response, so it is worked
 * out once, not on every request.
 */
const slimmed = new WeakMap<WatchResponse, WatchResponse>();
function slimWatch(response: WatchResponse): WatchResponse {
  const hit = slimmed.get(response);
  if (hit) return hit;
  const out: WatchResponse = {
    ...response,
    sources: response.sources.map((source) => {
      if (!source.iframeEpisodes) return source;
      const episodes: NonNullable<typeof source.iframeEpisodes> = {};
      for (const [n, episode] of Object.entries(source.iframeEpisodes)) {
        episodes[n] = { url: episode.url, thumbs: [] };
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
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
      return catalog.browse(query, allowAdult, request.userId);
    },
  );

  // A random title out of the catalogue's current filters.
  fastify.get(
    "/anime/random-from",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const query = parse(animeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
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
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
      const { home } = parse(z.object({ home: z.enum(["1"]).optional() }), request.query);
      // Only what can actually be watched here: a random title that then
      // says "no player" is a dead end, not a surprise.
      const pool = await fastify.prisma.anime.findMany({
        where: {
          AND: [
            { score: { gte: 7 }, imageUrl: { not: null }, watchAvailability: { hasPlayer: true } },
            contentGuardWhere(home === "1" ? false : allowAdult),
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
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
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
    const episodes = await episodeInfo.get(id, lang);
    return { episodes, pending: episodeInfo.pending(id) };
  });

  fastify.get(
    "/anime/:id",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const { lang } = parse(localeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
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
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
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
    // The catalogue's full-size screenshots. Kodik's episode stills were the
    // only large per-episode ones, but its CDN refuses many viewers, so its
    // links are never handed out; AniLibria's previews (200x113, too small
    // for a full-width hero) only stand in when there are no screenshots.
    const shots = await catalog.heroFrames(id);
    const fromEpisodes =
      shots.length >= 4
        ? []
        : await fastify.services.watch
            .getSources(id)
            .then((watch) => {
              const byEpisode = new Map<number, string>();
              for (const source of watch.sources) {
                for (const [key, meta] of Object.entries(source.episodeMeta ?? {})) {
                  const n = Number(key);
                  if (Number.isInteger(n) && meta.thumb && !byEpisode.has(n)) byEpisode.set(n, meta.thumb);
                }
              }
              return [...byEpisode.entries()].sort((x, y) => y[0] - x[0]).map(([, url]) => url);
            })
            .catch(() => [] as string[]);
    const frames = [...shots, ...fromEpisodes].slice(0, 12);
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

  fastify.get("/anime/:id/watch", async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const { id } = parse(idParams, request.params);
    const { refresh } = parse(z.object({ refresh: z.literal("1").optional() }), request.query);
    return slimWatch(await (refresh ? watch.refreshSources(id) : watch.getSources(id)));
  });

  fastify.get("/anime/:id/streams/kodik/:translationId/:episode/master.m3u8", {
    config: { rateLimit: { max: 90, timeWindow: "1 minute" } },
    preHandler: fastify.optionalAuth,
  }, async (request, reply) => {
    const { id, translationId, episode } = parse(z.object({
      id: z.coerce.number().int().positive(), translationId: z.string().regex(/^\d{1,12}$/),
      episode: z.coerce.number().int().min(1).max(10000),
    }), request.params);
    const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
    const title = await fastify.prisma.anime.findFirst({ where: { id, ...contentGuardWhere(allowAdult) }, select: { id: true } });
    if (!title) throw new NotFoundError("Аниме не найдено.");
    const { variants } = await watch.getKodikStreams(id, translationId, episode);
    reply.header("cache-control", "private, no-store");
    return reply.type("application/vnd.apple.mpegurl").send(kodikMasterPlaylist(variants));
  });

  fastify.get("/anime/:id/streams/animevost/:releaseId/:episode/video.mp4", {
    config: { rateLimit: { max: 240, timeWindow: "1 minute" } }, preHandler: fastify.optionalAuth,
  }, async (request, reply) => {
    const { id, releaseId, episode } = parse(z.object({ id: z.coerce.number().int().positive(),
      releaseId: z.string().regex(/^\d{1,12}$/), episode: z.coerce.number().int().min(1).max(10000) }), request.params);
    const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
    const title = await fastify.prisma.anime.findFirst({ where: { id, ...contentGuardWhere(allowAdult) }, select: { id: true } });
    if (!title) throw new NotFoundError("Аниме не найдено.");
    return sendAnimeVostVideo(request, reply, await watch.getAnimeVostStream(id, releaseId, episode));
  });
};
