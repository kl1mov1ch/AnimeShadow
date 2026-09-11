import { animeQuerySchema, localeQuerySchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.coerce.number().int().positive() });
const slugParams = z.object({ slug: z.string().min(1).max(120) });

export const animeRoutes: FastifyPluginAsync = async (fastify) => {
  const { catalog, watch } = fastify.services;

  fastify.get("/anime", async (request) => {
    const query = parse(animeQuerySchema, request.query);
    return catalog.browse(query);
  });

  // A random well-rated title — powers the "surprise me" action.
  fastify.get("/anime/random", async () => {
    const pool = await fastify.prisma.anime.findMany({
      where: { score: { gte: 7 }, imageUrl: { not: null } },
      select: { id: true, slug: true },
    });
    if (pool.length === 0) throw new NotFoundError("Каталог пуст.");
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    return { id: pick.id, slug: pick.slug };
  });

  fastify.get("/anime/:id", async (request) => {
    const { id } = parse(idParams, request.params);
    const { lang } = parse(localeQuerySchema, request.query);
    return catalog.getAnimeById(id, lang);
  });

  // ЧПУ: resolve a slug → id, then serve the same detail payload.
  fastify.get("/anime/by-slug/:slug", async (request) => {
    const { slug } = parse(slugParams, request.params);
    const { lang } = parse(localeQuerySchema, request.query);
    const row = await fastify.prisma.anime.findFirst({
      where: { slug },
      select: { id: true },
      orderBy: { members: "desc" },
    });
    if (!row) throw new NotFoundError("Аниме не найдено.");
    return catalog.getAnimeById(row.id, lang);
  });

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

  fastify.get("/anime/:id/watch", async (request) => {
    const { id } = parse(idParams, request.params);
    return watch.getSources(id);
  });
};
