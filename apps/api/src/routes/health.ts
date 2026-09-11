import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async (_request, reply) => {
    const db = await fastify.databaseHealthy();
    if (!db) reply.code(503);
    return {
      status: db ? "ok" : "degraded",
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  });
};
