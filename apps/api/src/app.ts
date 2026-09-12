import compress from "@fastify/compress";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from "fastify";
import { env, isProduction } from "./config/env.js";
import { loggerConfig } from "./lib/logger.js";
import { AppError } from "./lib/errors.js";
import authPlugin from "./plugins/auth.js";
import prismaPlugin from "./plugins/prisma.js";
import servicesPlugin from "./plugins/services.js";
import { animeRoutes } from "./routes/anime.js";
import { authRoutes } from "./routes/auth.js";
import { commentRoutes } from "./routes/comments.js";
import { discoverRoutes } from "./routes/discover.js";
import { funRoutes } from "./routes/fun.js";
import { genreRoutes } from "./routes/genres.js";
import { healthRoutes } from "./routes/health.js";
import { imageRoutes } from "./routes/image.js";
import { libraryRoutes } from "./routes/library.js";
import { profileRoutes } from "./routes/profile.js";
import { progressRoutes } from "./routes/progress.js";
import { recommendationRoutes } from "./routes/recommendations.js";
import { reviewRoutes } from "./routes/reviews.js";
import { searchRoutes } from "./routes/search.js";
import { sitemapRoutes } from "./routes/sitemap.js";
import { uploadsRoutes } from "./routes/uploads.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerConfig,
    trustProxy: true,
  });

  await app.register(helmet, {
    // The API serves JSON only; the browser app sets its own CSP.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(cors, {
    // In dev the Vite server may land on any free port (5173, 5174, 5175…),
    // so accept any loopback origin. In production, use the explicit allow-list.
    origin: isProduction
      ? env.CORS_ORIGINS.length > 0
        ? env.CORS_ORIGINS
        : false
      : (origin, cb) => {
          if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            cb(null, true);
            return;
          }
          cb(null, env.CORS_ORIGINS.includes(origin));
        },
    credentials: true,
  });
  await app.register(sensible);
  // Everything here is JSON — gzip/brotli shrinks a discover/browse page a lot.
  await app.register(compress, { threshold: 1024, encodings: ["br", "gzip"] });
  await app.register(rateLimit, {
    max: 600,
    timeWindow: "1 minute",
    // Shared NAT/CGNAT means many real users can share one IP — don't let the
    // image proxy or health checks eat into a user's request budget either.
    allowList: (request) =>
      request.url.startsWith("/api/health") ||
      request.url.startsWith("/api/img") ||
      request.url.startsWith("/uploads"),
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(servicesPlugin);

  // Public catalogue reads are safe to cache at the edge/browser; anything
  // touched by an authenticated request never is. `request.userId` is set by
  // both `authenticate` and `optionalAuth`, so a personalised response (e.g.
  // comments carrying the caller's own vote) is correctly excluded even
  // though the route itself is public.
  const PUBLIC_CACHE: Array<[RegExp, string]> = [
    [/^\/api\/discover(\?|$)/, "public, max-age=60, stale-while-revalidate=300"],
    [/^\/api\/genres(\?|$)/, "public, max-age=3600"],
    [/^\/api\/anime\/by-slug\/[^/]+(\?|$)/, "public, max-age=120, stale-while-revalidate=600"],
    [/^\/api\/anime\/\d+(\?|$)/, "public, max-age=120, stale-while-revalidate=600"],
    [/^\/api\/anime(\?|$)/, "public, max-age=60, stale-while-revalidate=300"],
    [/^\/api\/search(\?|$)/, "public, max-age=60"],
    // Same content for every anonymous viewer on a given day (day-seeded) —
    // a signed-in call is personalised and never reaches here (see below).
    [/^\/api\/recommendations\/home(\?|$)/, "public, max-age=300"],
    [/^\/api\/anime\/\d+\/similar(\?|$)/, "public, max-age=300"],
  ];
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.method !== "GET") return payload;
    if (request.userId) {
      reply.header("cache-control", "private, no-store");
      return payload;
    }
    const hit = PUBLIC_CACHE.find(([re]) => re.test(request.url));
    if (hit) reply.header("cache-control", hit[1]);
    return payload;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      });
    }

    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests — give it a moment.",
        },
      });
    }

    if (error.validation || error.statusCode === 400) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "That request didn't look right." },
      });
    }

    request.log.error({ err: error }, "unhandled error");
    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    return reply.code(status).send({
      error: {
        code: "INTERNAL",
        message: "Something went wrong on our end.",
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `No route for ${request.method} ${request.url}`,
      },
    });
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(imageRoutes);
      await api.register(discoverRoutes);
      await api.register(animeRoutes);
      await api.register(reviewRoutes);
      await api.register(searchRoutes);
      await api.register(genreRoutes);
      await api.register(authRoutes);
      await api.register(libraryRoutes);
      await api.register(progressRoutes);
      await api.register(commentRoutes);
      await api.register(profileRoutes);
      await api.register(recommendationRoutes);
      await api.register(funRoutes);
    },
    { prefix: "/api" },
  );

  // Served at the site root (not under /api) for crawlers and <img> tags.
  await app.register(sitemapRoutes);
  await app.register(uploadsRoutes);

  return app;
}
