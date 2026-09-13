import { searchQuerySchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { resolveAllowAdult } from "../lib/content-guard.js";
import { parse } from "../lib/validation.js";

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/search",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { q, lang, limit, fast } = parse(searchQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      return fastify.services.search.search(q, lang, limit, fast, allowAdult);
    },
  );
};
