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
    async (request) => ({
      genreIds: await recommendations.getPreferences(request.userId!),
    }),
  );

  fastify.put(
    "/me/genre-preferences",
    { preHandler: fastify.authenticate },
    async (request) => {
      const input = parse(setGenrePreferencesInputSchema, request.body);
      const genreIds = await recommendations.setPreferences(
        request.userId!,
        input.genreIds,
      );
      return { genreIds };
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
      const detail = await catalog.getAnimeById(id, undefined, allowAdult);
      const genreIds = detail.genresDetailed.map((g) => g.id);
      return recommendations.similarTo(id, genreIds, request.userId ?? null, undefined, allowAdult);
    },
  );
};
