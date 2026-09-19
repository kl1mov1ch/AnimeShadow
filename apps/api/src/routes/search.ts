import { frameSearchInputSchema, searchQuerySchema } from "@animeshadow/shared";
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

  fastify.post(
    "/search/frame",
    {
      // Signed in only: every call spends part of a shared monthly quota on
      // trace.moe's free tier, so it is not something to leave open to
      // anonymous traffic.
      preHandler: fastify.authenticate,
      // Fastify defaults to 1MB, and a screenshot carried as a base64 data
      // URL is about a third larger than the file it came from — well past
      // that for anything at screen resolution. The service enforces the
      // real 4MB ceiling on the decoded bytes.
      bodyLimit: 6 * 1024 * 1024,
    },
    async (request) => {
      const { dataUrl } = parse(frameSearchInputSchema, request.body);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      return fastify.services.frames.searchByFrame(dataUrl, allowAdult);
    },
  );
};
