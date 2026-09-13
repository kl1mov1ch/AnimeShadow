import { pageViewInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  const { analytics } = fastify.services;

  fastify.post(
    "/analytics/pageview",
    { preHandler: fastify.optionalAuth },
    async (request, reply) => {
      const input = parse(pageViewInputSchema, request.body);
      await analytics.record(input, request.userId);
      reply.code(204);
    },
  );
};
