import { upsertReviewInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.coerce.number().int().positive() });

export const reviewRoutes: FastifyPluginAsync = async (fastify) => {
  const { reviews } = fastify.services;

  // Public list — includes the viewer's own review flagged when signed in.
  fastify.get(
    "/anime/:id/reviews",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { id } = parse(idParams, request.params);
      return reviews.list(id, request.userId);
    },
  );

  fastify.put(
    "/anime/:id/reviews",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const input = parse(upsertReviewInputSchema, request.body);
      return reviews.upsert(request.userId!, id, input);
    },
  );

  fastify.delete(
    "/anime/:id/reviews",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = parse(idParams, request.params);
      await reviews.remove(request.userId!, id);
      reply.code(204);
      return null;
    },
  );
};
