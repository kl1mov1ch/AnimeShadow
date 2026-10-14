import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveAllowAdult } from "../lib/content-guard.js";
import { parse } from "../lib/validation.js";

/** The broadcast schedule, a week at a time (0 = this week). */
export const scheduleRoutes: FastifyPluginAsync = async (fastify) => {
  const { schedule } = fastify.services;
  fastify.get("/schedule", { preHandler: fastify.optionalAuth }, async (request, reply) => {
    const { week } = parse(z.object({ week: z.coerce.number().int().min(-2).max(3).default(0) }), request.query);
    const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
    // Marked with the viewer's own list: only a guest's answer may be shared.
    reply.header("cache-control", request.userId ? "private, no-store" : "public, max-age=300");
    return schedule.week(week, request.userId, allowAdult);
  });
};
