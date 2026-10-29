import { landingPath, parseLandingPath, seasonOf, shiftSeason } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere } from "../lib/content-guard.js";
import { NotFoundError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";
import { SITE } from "../seo/html.js";
import { PAGE_CSP } from "../seo/csp.js";
import { isTvBrowser, tvDestination } from "../lib/tv-mode.js";
import { dubStudios, STUDIO_MIN_TITLES } from "../services/dub-studios.js";
import { EPISODE_PAGES_MAX } from "../seo/render.js";

/** Anime per sitemap file (the limit is 50 000; smaller files regenerate faster). */
const ANIME_PER_SITEMAP = 10_000;
const files = new TtlCache<string>(60 * 60_000, 64);
/** Episode pages per sitemap file. */
const EPISODES_PER_SITEMAP = 40_000;
const episodeIndex = new TtlCache<Array<{ slug: string; released: number; updatedAt: Date }>>(60 * 60_000, 1);

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
    reply.header("vary", "User-Agent, Cookie");
    if (/(?:\?|&)tv=0(?:&|$)/.test(url)) reply.header("set-cookie", "as_full_site=1; Path=/; Max-Age=2592000; SameSite=Lax");
    else if (isTvBrowser(request.headers["user-agent"] ?? "") && !/(?:^|;\s*)as_full_site=1(?:;|$)/.test(request.headers.cookie ?? "")) {
      return reply.header("cache-control", "private, no-store").header("vary", "User-Agent, Cookie").redirect(tvDestination(url), 302);
    }
    const page = await seo.render(url.startsWith("/") ? url : `/${url}`);
    if (page.redirect) {
      reply.header("cache-control", "public, max-age=3600");
      return reply.redirect(page.redirect, 301);
    }
    reply
      .code(page.status)
      .header("content-type", "text/html; charset=utf-8")
      // Always re-checked, so a deploy shows at once.
      .header("cache-control", "no-cache")
      .header("content-security-policy", PAGE_CSP);
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
      // Watch-together rooms live for an evening: nothing to keep in an index.
      "Disallow: /party/",
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
      // Watch-together rooms live for an evening: nothing to keep in an index.
      "Disallow: /party/",
      "Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&fbclid",
      // A title's page opened on an episode or a second (?ep=3&t=120) is still that page.
      "Clean-param: ep&t /anime/",
      "Clean-param: ref",
      "",
      `Sitemap: ${SITE}/sitemap.xml`,
      "",
    ].join("\n");
  });

  const xml = (reply: { header: (k: string, v: string) => unknown }) => {
    reply.header("content-type", "application/xml; charset=utf-8");
    reply.header("cache-control", "public, max-age=3600");
  };

  /** Every series the site can play, with how many episodes are out — one row per title. */
  const episodeTitles = () =>
    episodeIndex.wrap("all", async () => {
      const counts = await fastify.prisma.playerSource.groupBy({
        by: ["animeId"],
        where: {
          kind: { not: "subtitles" },
          episodesCount: { gt: 0 },
          anime: { AND: [contentGuardWhere(false), { type: { not: "MOVIE" } }, { watchAvailability: { is: { hasPlayer: true } } }] },
        },
        _max: { episodesCount: true },
      });
      const released = new Map(counts.map((c) => [c.animeId, Math.min(EPISODE_PAGES_MAX, c._max.episodesCount ?? 0)]));
      const rows = await fastify.prisma.anime.findMany({
        where: { id: { in: [...released.keys()] } },
        select: { id: true, slug: true, updatedAt: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({ slug: r.slug, released: released.get(r.id) ?? 0, updatedAt: r.updatedAt })).filter((r) => r.released > 0);
    });

  fastify.get("/seo-files/sitemap.xml", async (_request, reply) => {
    xml(reply);
    return files.wrap("index", async () => {
      const count = await fastify.prisma.anime.count({ where: contentGuardWhere(true) });
      const parts = ["sitemap-pages.xml", "sitemap-collections.xml"];
      for (let i = 1; i <= Math.max(1, Math.ceil(count / ANIME_PER_SITEMAP)); i++) parts.push(`sitemap-anime-${i}.xml`);
      const episodes = (await episodeTitles()).reduce((sum, t) => sum + t.released, 0);
      for (let i = 1; i <= Math.ceil(episodes / EPISODES_PER_SITEMAP); i++) parts.push(`sitemap-episodes-${i}.xml`);
      const now = new Date().toISOString();
      return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts
        .map((p) => `<sitemap><loc>${SITE}/${p}</loc><lastmod>${now}</lastmod></sitemap>`)
        .join("\n")}\n</sitemapindex>\n`;
    });
  });

  fastify.get("/seo-files/sitemap-pages.xml", async (_request, reply) => {
    xml(reply);
    return files.wrap("pages", async () => {
      const [genres, studios] = await Promise.all([landing.genres(), dubStudios(fastify.prisma)]);
      const years = await fastify.prisma.$queryRaw<Array<{ year: number; count: number }>>`
        SELECT year, COUNT(*)::int AS count FROM "Anime"
        WHERE year IS NOT NULL AND (rating IS NULL OR (rating NOT ILIKE 'rx%'))
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
        ["/schedule", "0.7"],
        ["/studios", "0.7"],
        ["/studio/hon-kon", "0.6"],
        ["/party", "0.4"],
        ...studios.list
          .filter((studio) => studio.count >= STUDIO_MIN_TITLES && !/^hon-?kon/.test(studio.slug))
          .map((studio): [string, string] => [`/studios/${studio.slug}`, studio.count >= 200 ? "0.7" : "0.5"]),
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
        where: contentGuardWhere(true),
        // Stable order, so a title stays in the same file.
        orderBy: { id: "asc" },
        skip: (n - 1) * ANIME_PER_SITEMAP,
        take: ANIME_PER_SITEMAP,
        select: { slug: true, updatedAt: true, members: true, imageLargeUrl: true, imageUrl: true, titleLocalized: true, title: true, screenshots: true },
      });
      return urlset(
        rows.map((a) => {
          const priority = (a.members ?? 0) > 200_000 ? "0.9" : (a.members ?? 0) > 20_000 ? "0.8" : "0.6";
          const image = a.imageLargeUrl ?? a.imageUrl;
          return `<url><loc>${SITE}/anime/${esc(a.slug)}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod><priority>${priority}</priority>${
            image ? `<image:image><image:loc>${esc(image)}</image:loc><image:title>${esc(a.titleLocalized ?? a.title)}</image:title></image:image>` : ""
          }${
            // Frames of the show (with the site's mark) for image search, three per title.
            a.screenshots
              .slice(0, 3)
              .map(
                (f, i) =>
                  `<image:image><image:loc>${esc(`${SITE}/api/img?u=${encodeURIComponent(f)}&w=1280&wm=1&f=jpg`)}</image:loc><image:title>${esc(`${a.titleLocalized ?? a.title} — кадр ${i + 1}`)}</image:title></image:image>`,
              )
              .join("")
          }</url>`;
        }),
        true,
      );
    });
  });

  // "<название> 5 серия": one address per episode, in files of 40 000.
  fastify.get("/seo-files/sitemap-episodes-:n.xml", async (request, reply) => {
    const { n } = parse(z.object({ n: z.coerce.number().int().min(1).max(500) }), request.params);
    xml(reply);
    return files.wrap(`episodes-${n}`, async () => {
      const from = (n - 1) * EPISODES_PER_SITEMAP;
      const to = from + EPISODES_PER_SITEMAP;
      const urls: string[] = [];
      let at = 0;
      for (const title of await episodeTitles()) {
        if (at + title.released <= from) {
          at += title.released;
          continue;
        }
        for (let e = 1; e <= title.released && at < to; e++, at++) {
          if (at < from) continue;
          // The newest episode of a show is what people look for this week.
          const priority = e === title.released ? "0.7" : "0.5";
          urls.push(`<url><loc>${SITE}/anime/${esc(title.slug)}/episode/${e}</loc>${e === title.released ? `<lastmod>${title.updatedAt.toISOString()}</lastmod>` : ""}<priority>${priority}</priority></url>`);
        }
        if (at >= to) break;
      }
      if (urls.length === 0) throw new NotFoundError("Нет такого файла");
      return urlset(urls);
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
