import { upsertProgressInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.coerce.number().int().positive() });

export const progressRoutes: FastifyPluginAsync = async (fastify) => {
  const { progress } = fastify.services;

  fastify.get(
    "/anime/:id/progress",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { id } = parse(idParams, request.params);
      return progress.get(request.userId!, id);
    },
  );

  fastify.put(
    "/anime/:id/progress",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const input = parse(upsertProgressInputSchema, request.body);
      return progress.upsert(request.userId!, id, input);
    },
  );

  fastify.get(
    "/me/continue",
    { preHandler: fastify.authenticate },
    async (request) => ({
      items: await progress.continueWatching(request.userId!),
    }),
  );
};
