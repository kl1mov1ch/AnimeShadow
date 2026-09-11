import type { FastifyPluginAsync } from "fastify";

export const genreRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/genres", async () => ({
    items: await fastify.services.catalog.listGenres(),
  }));
};
