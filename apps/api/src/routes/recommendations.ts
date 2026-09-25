import { setGenrePreferencesInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveAllowAdult } from "../lib/content-guard.js";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.coerce.number().int().positive() });

export const recommendationRoutes: FastifyPluginAsync = async (fastify) => {
  const { recommendations, catalog } = fastify.services;

  fastify.get(
    "/me/genre-preferences",
    { preHandler: fastify.authenticate },
    async (request) => recommendations.getPreferencesStatus(request.userId!),
  );

  fastify.put(
    "/me/genre-preferences",
    { preHandler: fastify.authenticate },
    async (request) => {
      const input = parse(setGenrePreferencesInputSchema, request.body);
      return recommendations.setPreferences(request.userId!, input.genreIds);
    },
  );

  fastify.get(
    "/recommendations/home",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      return recommendations.homeRail(request.userId ?? null, undefined, allowAdult);
    },
  );

  fastify.get(
    "/anime/:id/similar",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      // Only the genres are needed. Read them straight from the catalogue;
      // the full detail (with its upstream enrichment) only for a title we
      // haven't stored yet.
      const row = await fastify.prisma.anime.findUnique({
        where: { id },
        select: { rating: true, genres: { select: { genreId: true } } },
      });
      let genreIds: number[];
      if (row) {
        catalog.ensureViewable(row.rating, allowAdult);
        genreIds = row.genres.map((g) => g.genreId);
      } else {
        const detail = await catalog.getAnimeById(id, undefined, allowAdult);
        genreIds = detail.genresDetailed.map((g) => g.id);
      }
      return recommendations.similarTo(id, genreIds, request.userId ?? null, undefined, allowAdult);
    },
  );

  fastify.get(
    "/me/liked-anime",
    { preHandler: fastify.authenticate },
    async (request) => ({
      items: await recommendations.getLikedAnime(request.userId!),
    }),
  );

  fastify.put(
    "/me/liked-anime/:id",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { id } = parse(idParams, request.params);
      await recommendations.likeAnime(request.userId!, id);
      return { liked: true };
    },
  );

  fastify.delete(
    "/me/liked-anime/:id",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { id } = parse(idParams, request.params);
      await recommendations.unlikeAnime(request.userId!, id);
      return { liked: false };
    },
  );

  fastify.get(
    "/me/recommendations-status",
    { preHandler: fastify.authenticate },
    async (request) => ({
      configured: await recommendations.isConfigured(request.userId!),
    }),
  );
};
