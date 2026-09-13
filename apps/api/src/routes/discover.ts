import { localeQuerySchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { resolveAllowAdult } from "../lib/content-guard.js";
import { parse } from "../lib/validation.js";

export const discoverRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/discover",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { lang } = parse(localeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      return fastify.services.catalog.getDiscover(lang, allowAdult);
    },
  );
};
