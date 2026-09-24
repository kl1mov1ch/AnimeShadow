import { animeQuerySchema, localeQuerySchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import { NotFoundError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.coerce.number().int().positive() });
const slugParams = z.object({ slug: z.string().min(1).max(120) });

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
      const pool = await fastify.prisma.anime.findMany({
        where: {
          AND: [{ score: { gte: 7 }, imageUrl: { not: null } }, contentGuardWhere(allowAdult)],
        },
        select: { id: true, slug: true },
      });
      if (pool.length === 0) throw new NotFoundError("Каталог пуст.");
      const pick = pool[Math.floor(Math.random() * pool.length)]!;
      return { id: pick.id, slug: pick.slug };
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
      catalog.recordView(id);
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
      catalog.recordView(row.id);
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

  /** The title's opening, used as background motion. `null` is a normal
   *  answer — most titles in the catalogue are not in the archive. */
  fastify.get("/anime/:id/opening", async (request) => {
    const { id } = parse(idParams, request.params);
    return { opening: await catalog.getOpening(id) };
  });

  /** Opening and ending together, for the theme player. Same cached upstream
   *  record as /opening above. */
  fastify.get("/anime/:id/themes", async (request) => {
    const { id } = parse(idParams, request.params);
    return catalog.getThemes(id);
  });

  fastify.get("/anime/:id/franchise", async (request) => {
    const { id } = parse(idParams, request.params);
    return { items: await catalog.getFranchise(id) };
  });

  fastify.get("/anime/:id/watch", async (request) => {
    const { id } = parse(idParams, request.params);
    return watch.getSources(id);
  });
};
