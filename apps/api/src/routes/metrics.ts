import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
import { registry } from "../lib/metrics.js";

function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** GET /metrics — Prometheus scrape endpoint. Deliberately outside /api and
 * outside the usual JSON error envelope: Prometheus expects plain text in
 * its own exposition format at exactly this path, nothing else. */
export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/metrics", async (request, reply) => {
    if (env.METRICS_TOKEN) {
      const auth = request.headers.authorization;
      const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
      // Header only: a token in the query string ends up in access logs.
      // Constant-time: `!==` stops at the first character that differs.
      if (!bearer || !sameSecret(bearer, env.METRICS_TOKEN)) {
        reply.code(401);
        return "unauthorized\n";
      }
    }
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });
};
