import { pageLeaveInputSchema, pageViewInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  const { analytics } = fastify.services;

  fastify.post(
    "/analytics/pageview",
    { preHandler: fastify.optionalAuth },
    async (request, reply) => {
      const input = parse(pageViewInputSchema, request.body);
      // Queued and written in batches (see AnalyticsService).
      analytics.record(input, request.userId, request.headers["user-agent"]);
      reply.code(204);
    },
  );

  // sendBeacon posts text/plain (no CORS preflight); the body is JSON either way.
  fastify.addContentTypeParser("text/plain", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, {});
    }
  });

  fastify.post("/analytics/leave", async (request, reply) => {
    const input = parse(pageLeaveInputSchema, request.body);
    analytics.leave(input);
    reply.code(204);
  });
};
