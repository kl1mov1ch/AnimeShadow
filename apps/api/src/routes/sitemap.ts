import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
import { contentGuardWhere } from "../lib/content-guard.js";

const SITE =
  (env.CORS_ORIGINS[0] ?? "http://localhost:5173").replace(/\/$/, "");

/** Root sitemap for crawlers. Anime pages use their slug; priorities per spec. */
export const sitemapRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/sitemap.xml", async (request, reply) => {
    const [anime, genres] = await Promise.all([
      fastify.prisma.anime.findMany({
        // Hentai is never worth indexing, verified viewer or not — R+ stays
        // in (it's real, just age-gated once you click through).
        where: contentGuardWhere(true),
        select: { slug: true, updatedAt: true },
        orderBy: { members: "desc" },
        take: 5000,
      }),
      fastify.prisma.genre.findMany({ select: { name: true } }),
    ]);

    const urls: string[] = [
      `<url><loc>${SITE}/</loc><priority>1.0</priority></url>`,
      `<url><loc>${SITE}/browse</loc><priority>0.8</priority></url>`,
      `<url><loc>${SITE}/support</loc><priority>0.5</priority></url>`,
      `<url><loc>${SITE}/about</loc><priority>0.5</priority></url>`,
      ...genres.map(
        (g) =>
          `<url><loc>${SITE}/genre/${encodeURIComponent(g.name)}</loc><priority>0.7</priority></url>`,
      ),
      ...anime.map(
        (a) =>
          `<url><loc>${SITE}/anime/${a.slug}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod><priority>0.9</priority></url>`,
      ),
    ];

    reply.header("content-type", "application/xml; charset=utf-8");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  });
};
