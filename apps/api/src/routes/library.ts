import {
  libraryQuerySchema,
  upsertLibraryInputSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const animeIdParams = z.object({
  animeId: z.coerce.number().int().positive(),
});

export const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  const { library } = fastify.services;

  // Everything here is per-user.
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/library", async (request) => {
    const { status } = parse(libraryQuerySchema, request.query);
    return { items: await library.list(request.userId!, status) };
  });

  fastify.get("/library/summary", async (request) =>
    library.summary(request.userId!),
  );

  fastify.put("/library/:animeId", async (request) => {
    const { animeId } = parse(animeIdParams, request.params);
    const input = parse(upsertLibraryInputSchema, request.body);
    return library.upsert(request.userId!, animeId, input);
  });

  fastify.delete("/library/:animeId", async (request, reply) => {
    const { animeId } = parse(animeIdParams, request.params);
    await library.remove(request.userId!, animeId);
    reply.code(204);
    return null;
  });
};
