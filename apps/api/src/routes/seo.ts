import { landingPath, parseLandingPath, seasonOf, shiftSeason } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere } from "../lib/content-guard.js";
import { NotFoundError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";
import { SITE } from "../seo/html.js";

/** Anime per sitemap file (the limit is 50 000; smaller files regenerate faster). */
const ANIME_PER_SITEMAP = 10_000;
const files = new TtlCache<string>(60 * 60_000, 64);

/**
 * Search-engine plumbing. Caddy sends every page request here
 * (/api/seo/page/<path>) so the HTML carries that page's own title, content
 * and structured data; and /robots.txt, /sitemap*.xml and the IndexNow key
 * file (/api/seo-files/…).
 */
export const seoRoutes: FastifyPluginAsync = async (fastify) => {
  const { seo, landing } = fastify.services;

  fastify.get("/seo/page/*", async (request, reply) => {
    const url = request.url.slice("/api/seo/page".length) || "/";
    const page = await seo.render(url.startsWith("/") ? url : `/${url}`);
    if (page.redirect) {
      reply.header("cache-control", "public, max-age=3600");
      return reply.redirect(page.redirect, 301);
    }
    reply
      .code(page.status)
      .header("content-type", "text/html; charset=utf-8")
      // Always re-checked, so a deploy shows at once.
      .header("cache-control", "no-cache");
    return page.html;
  });

  // The landing pages' data for the app — the same the HTML above lists.
  fastify.get("/landing", async (request, reply) => {
    const { path, page } = parse(z.object({ path: z.string().min(1).max(200), page: z.coerce.number().int().min(1).max(500).optional() }), request.query);
    const params = parseLandingPath(path, page ? `?page=${page}` : "");
    const result = params ? await landing.page(params) : null;
    if (!result) throw new NotFoundError("Такой страницы нет");
    reply.header("cache-control", "public, max-age=300");
    return result;
  });

  fastify.get("/seo-files/robots.txt", async (_request, reply) => {
    reply.header("content-type", "text/plain; charset=utf-8").header("cache-control", "public, max-age=3600");
    return [
      "User-agent: *",
      "Allow: /",
      // Private pages: nothing to find there.
      "Disallow: /admin",
      "Disallow: /library",
      "Disallow: /profile$",
      "Disallow: /login",
      "Disallow: /register",
      "Disallow: /verify-email",
      "Disallow: /forgot-password",
      "Disallow: /reset-password",
      "Disallow: /collections/new",
      "Disallow: /collections/stats",
      "Disallow: /*/edit$",
      "Disallow: /api/admin",
      "Disallow: /api/auth",
      "Disallow: /api/me",
      "",
      // Yandex: the same page with tracking tags is still the same page.
      "User-agent: Yandex",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /library",
      "Disallow: /profile$",
      "Disallow: /login",
      "Disallow: /register",
      "Disallow: /verify-email",
      "Disallow: /forgot-password",
      "Disallow: /reset-password",
      "Disallow: /collections/new",
      "Disallow: /collections/stats",
      "Disallow: /*/edit$",
      "Disallow: /api/admin",
      "Disallow: /api/auth",
      "Disallow: /api/me",
      "Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&fbclid",
      "",
      `Sitemap: ${SITE}/sitemap.xml`,
      "",
    ].join("\n");
  });

  const xml = (reply: { header: (k: string, v: string) => unknown }) => {
    reply.header("content-type", "application/xml; charset=utf-8");
    reply.header("cache-control", "public, max-age=3600");
  };

  fastify.get("/seo-files/sitemap.xml", async (_request, reply) => {
    xml(reply);
    return files.wrap("index", async () => {
      const count = await fastify.prisma.anime.count({ where: contentGuardWhere(false) });
      const parts = ["sitemap-pages.xml", "sitemap-collections.xml"];
      for (let i = 1; i <= Math.max(1, Math.ceil(count / ANIME_PER_SITEMAP)); i++) parts.push(`sitemap-anime-${i}.xml`);
      const now = new Date().toISOString();
      return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts
        .map((p) => `<sitemap><loc>${SITE}/${p}</loc><lastmod>${now}</lastmod></sitemap>`)
        .join("\n")}\n</sitemapindex>\n`;
    });
  });

  fastify.get("/seo-files/sitemap-pages.xml", async (_request, reply) => {
    xml(reply);
    return files.wrap("pages", async () => {
      const genres = await landing.genres();
      const years = await fastify.prisma.$queryRaw<Array<{ year: number; count: number }>>`
        SELECT year, COUNT(*)::int AS count FROM "Anime"
        WHERE year IS NOT NULL AND (rating IS NULL OR (rating NOT ILIKE 'rx%' AND rating NOT ILIKE 'r+%'))
        GROUP BY year HAVING COUNT(*) >= 10 ORDER BY year DESC
      `;
      const now = seasonOf(new Date());
      // Eight years of seasons back, and the next one (announcements).
      const seasons = Array.from({ length: 33 }, (_, i) => shiftSeason(now, 1 - i));
      const urls: Array<[string, string]> = [
        ["/", "1.0"],
        ["/browse", "0.9"],
        ["/ongoing", "0.9"],
        ["/top", "0.9"],
        ["/popular", "0.9"],
        ["/movies", "0.8"],
        ["/announced", "0.7"],
        ["/collections", "0.6"],
        ["/about", "0.3"],
        ["/support", "0.3"],
        ...seasons.map((s): [string, string] => [landingPath({ kind: "season", ...s }), "0.7"]),
        ...years.map((y): [string, string] => [landingPath({ kind: "year", year: y.year }), "0.6"]),
        ...genres.filter((g) => g.animeCount >= 5).map((g): [string, string] => [landingPath({ kind: "genre", genre: g.slug }), "0.7"]),
      ];
      return urlset(urls.map(([path, priority]) => `<url><loc>${SITE}${path}</loc><priority>${priority}</priority></url>`));
    });
  });

  fastify.get("/seo-files/sitemap-collections.xml", async (_request, reply) => {
    xml(reply);
    return files.wrap("collections", async () => {
      const rows = await fastify.prisma.collection.findMany({ where: { published: true }, select: { id: true, updatedAt: true }, take: 50_000 });
      return urlset(rows.map((c) => `<url><loc>${SITE}/collections/${c.id}</loc><lastmod>${c.updatedAt.toISOString()}</lastmod><priority>0.5</priority></url>`));
    });
  });

  fastify.get("/seo-files/sitemap-anime-:n.xml", async (request, reply) => {
    const { n } = parse(z.object({ n: z.coerce.number().int().min(1).max(100) }), request.params);
    xml(reply);
    return files.wrap(`anime-${n}`, async () => {
      const rows = await fastify.prisma.anime.findMany({
        where: contentGuardWhere(false),
        // Stable order, so a title stays in the same file.
        orderBy: { id: "asc" },
        skip: (n - 1) * ANIME_PER_SITEMAP,
        take: ANIME_PER_SITEMAP,
        select: { slug: true, updatedAt: true, members: true, imageLargeUrl: true, imageUrl: true, titleLocalized: true, title: true },
      });
      return urlset(
        rows.map((a) => {
          const priority = (a.members ?? 0) > 200_000 ? "0.9" : (a.members ?? 0) > 20_000 ? "0.8" : "0.6";
          const image = a.imageLargeUrl ?? a.imageUrl;
          return `<url><loc>${SITE}/anime/${esc(a.slug)}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod><priority>${priority}</priority>${
            image ? `<image:image><image:loc>${esc(image)}</image:loc><image:title>${esc(a.titleLocalized ?? a.title)}</image:title></image:image>` : ""
          }</url>`;
        }),
        true,
      );
    });
  });

  // IndexNow proves the site owns its key with a file of that name.
  fastify.get("/seo-files/indexnow-:key.txt", async (request, reply) => {
    const { key } = parse(z.object({ key: z.string().max(128) }), request.params);
    if (!env.INDEXNOW_KEY || key !== env.INDEXNOW_KEY) throw new NotFoundError("Нет такого файла");
    reply.header("content-type", "text/plain; charset=utf-8");
    return env.INDEXNOW_KEY;
  });
};

function urlset(urls: string[], images = false): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
    images ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""
  }>\n${urls.join("\n")}\n</urlset>\n`;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
