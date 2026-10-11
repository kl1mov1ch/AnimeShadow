import { frameSearchInputSchema, localeQuerySchema, searchQuerySchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { resolveAllowAdult } from "../lib/content-guard.js";
import { parse } from "../lib/validation.js";

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/search",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { q, lang, limit, fast, scope } = parse(searchQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      return fastify.services.search.search(q, lang, limit, fast, allowAdult, scope);
    },
  );

  // What the empty search window offers: a handful of titles being watched
  // right now, from the homepage's own (cached) lists — no work of its own.
  fastify.get(
    "/search/trending",
    { preHandler: fastify.optionalAuth },
    async (request, reply) => {
      const { lang } = parse(localeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
      const discover = await fastify.services.catalog.getDiscover(lang, allowAdult);
      const pool = [...discover.trendingNow, ...discover.topAiring];
      const seen = new Set<number>();
      const items = pool
        .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
        .slice(0, 8)
        .map((a) => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          titleLocalized: a.titleLocalized,
          imageUrl: a.imageUrl,
          type: a.type,
          year: a.year,
          score: a.score,
        }));
      reply.header("cache-control", "public, max-age=300");
      return { items };
    },
  );

  fastify.post(
    "/search/frame",
    {
      // Signed in only: every call spends part of a shared monthly quota on
      // trace.moe's free tier, so it is not something to leave open to
      // anonymous traffic.
      preHandler: fastify.authenticate,
      // A handful a minute per address: one account could otherwise spend
      // the whole month's quota in a loop.
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
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
