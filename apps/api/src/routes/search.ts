import { frameSearchInputSchema, localeQuerySchema, searchLogInputSchema, searchQuerySchema, type SearchPulse } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { resolveAllowAdult } from "../lib/content-guard.js";
import { parse } from "../lib/validation.js";

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/search",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { q, lang, limit, fast, scope } = parse(searchQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
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
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
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

  // A search someone made, for "what people look for now". Fire and forget.
  fastify.post(
    "/search/log",
    { preHandler: fastify.optionalAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { term } = parse(searchLogInputSchema, request.body);
      await fastify.services.search.logQuery(term, request.userId ?? null, request.ip);
      reply.code(204);
    },
  );

  // The empty search window: what people look for now, titles being
  // watched (to fill in while there are few searches), the genres watched most.
  fastify.get(
    "/search/pulse",
    { preHandler: fastify.optionalAuth },
    async (request, reply): Promise<SearchPulse> => {
      const { lang } = parse(localeQuerySchema, request.query);
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
      const [pulse, discover] = await Promise.all([
        fastify.services.search.pulse(allowAdult),
        fastify.services.catalog.getDiscover(lang, allowAdult),
      ]);
      const seen = new Set<number>();
      const hot = [...discover.trendingNow, ...discover.topAiring]
        .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
        .slice(0, 8)
        .map((a) => ({ id: a.id, slug: a.slug, title: a.title, titleLocalized: a.titleLocalized }));
      reply.header("cache-control", "public, max-age=120");
      return { searches: pulse.searches, hot, genres: pulse.genres };
    },
  );

  // How many searches are ahead: the page shows "в очереди: 2" while it waits.
  fastify.get("/search/frame/queue", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return fastify.services.frames.queue();
  });

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
      const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
      return fastify.services.frames.searchByFrame(dataUrl, allowAdult);
    },
  );
};
