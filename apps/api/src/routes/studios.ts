import type { FastifyPluginAsync } from "fastify";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere } from "../lib/content-guard.js";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { NotFoundError } from "../lib/errors.js";
import { kodikMasterPlaylist } from "../services/kodik-streams.js";
import type { Prisma } from "@animeshadow/db";
import { dubStudios, STUDIO_MIN_TITLES } from "../services/dub-studios.js";

const studioQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  sort: z.enum(["popular", "score", "new", "title"]).optional().default("popular"),
  status: z.enum(["all", "airing", "finished", "upcoming"]).optional().default("all"),
  type: z.enum(["all", "TV", "MOVIE", "OVA", "ONA", "SPECIAL"]).optional().default("all"),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});
const STUDIO_PAGE = 24;

/** Public catalogue: cached reads, no provider addresses or account data. */
export const studioRoutes: FastifyPluginAsync = async (app) => {
  const load = async () => {
    const records = await app.prisma.anime.findMany({
      where: {
        AND: [
          contentGuardWhere(false),
          {
            playerSources: {
              some: { title: { contains: "hon-kon", mode: "insensitive" } },
            },
          },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        titleLocalized: true,
        imageUrl: true,
        imageLargeUrl: true,
        bannerImage: true,
        year: true,
        episodes: true,
        airing: true,
        playerSources: {
          where: { title: { contains: "hon-kon", mode: "insensitive" } },
          select: { episodesCount: true, iframeEpisodes: true, hlsEpisodes: true },
        },
      },
      orderBy: [{ year: "desc" }, { id: "desc" }],
      take: 200,
    });
    return {
      releases: records.map(({ playerSources, ...anime }) => {
        const episodeNumbers = [
          ...new Set(
            playerSources.flatMap((source) => {
              const keys = Object.keys(
                (source.hlsEpisodes || source.iframeEpisodes || {}) as object,
              )
                .map(Number)
                .filter((n) => Number.isInteger(n) && n > 0 && n <= 3000);
              return keys.length
                ? keys
                : Array.from(
                    { length: Math.min(source.episodesCount ?? 0, 3000) },
                    (_, i) => i + 1,
                  );
            }),
          ),
        ].sort((a, b) => a - b);
        return {
          ...anime,
          imageLargeUrl:
            anime.imageLargeUrl?.replace("/cover/medium/", "/cover/large/") ?? null,
          availableEpisodes: episodeNumbers.length,
          episodeNumbers,
        };
      }),
    };
  };
  const cache = new TtlCache<Awaited<ReturnType<typeof load>>>(5 * 60_000, 1);
  app.get("/studios/hon-kon", async (_request, reply) => {
    const index = app.services?.honkon;
    if (index)
      void index.refresh().then(() => {
        cache.delete("catalog");
        index.auditOnce();
      });
    reply.header("cache-control", "public, max-age=15, stale-while-revalidate=60");
    return {
      ...(await cache.wrap("catalog", load)),
      ...(index ? { index: index.status() } : {}),
    };
  });
  app.get("/studios/hon-kon/clips/:id/master.m3u8", async (request, reply) => {
    const { id } = parse(
      z.object({ id: z.string().regex(/^(?:movie|serial)-\d+$/) }),
      request.params,
    );
    const streams = await app.services.honkon.clip(id);
    return reply
      .header("content-type", "application/vnd.apple.mpegurl")
      .header("cache-control", "no-store")
      .send(kodikMasterPlaylist(streams.variants));
  });
  app.get(
    "/studios/hon-kon/uploads/:id/episodes/:episode/master.m3u8",
    async (request, reply) => {
      const { id, episode } = parse(
        z.object({
          id: z.string().regex(/^(?:movie|serial)-\d+$/),
          episode: z.string().regex(/^[1-9]\d{0,3}$/),
        }),
        request.params,
      );
      const streams = await app.services.honkon.upload(id, episode);
      return reply
        .header("content-type", "application/vnd.apple.mpegurl")
        .header("cache-control", "no-store")
        .send(kodikMasterPlaylist(streams.variants));
    },
  );
  const admin = {
    preHandler: [app.authenticate, app.requireAdmin],
    config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
  };
  app.post("/studios/hon-kon/sync", admin, async () => {
    await app.services.honkon.refresh(true);
    cache.delete("catalog");
    return app.services.honkon.status();
  });
  app.post("/studios/hon-kon/audit", admin, async (_request, reply) => {
    void app.services.honkon.audit().catch(() => undefined);
    return reply.code(202).send(app.services.honkon.auditStatus());
  });
  app.get("/studios/hon-kon/audit", admin, async () =>
    app.services.honkon.auditStatus(),
  );
  /* ---------------- every dub studio ---------------- */

  const loadStudios = () => dubStudios(app.prisma);

  app.get("/dubs", async (_request, reply) => {
    const { list } = await loadStudios();
    reply.header("cache-control", "public, max-age=600, stale-while-revalidate=3600");
    return { studios: list.filter((studio) => studio.count >= STUDIO_MIN_TITLES) };
  });

  const studioPageCache = new TtlCache<unknown>(5 * 60_000, 400);
  app.get("/dubs/:slug", async (request, reply) => {
    const { slug } = parse(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/) }), request.params);
    const query = parse(studioQuerySchema, request.query);
    const { list, names } = await loadStudios();
    const studio = list.find((entry) => entry.slug === slug);
    const titles = names.get(slug);
    if (!studio || !titles) throw new NotFoundError("Такой студии озвучки нет");
    reply.header("cache-control", "public, max-age=120, stale-while-revalidate=600");
    const key = `${slug}|${query.q.toLowerCase()}|${query.sort}|${query.status}|${query.type}|${query.page}`;
    return studioPageCache.wrap(key, async () => {
      // Loaded on first use: the package opens the database on import, and
      // the hon-kon routes above (and their tests) never need it.
      const { ANIME_WITH_GENRES_INCLUDE, toSummaryDto } = await import("@animeshadow/db");
      const where: Prisma.AnimeWhereInput = {
        AND: [
          contentGuardWhere(false),
          { playerSources: { some: { title: { in: titles } } } },
          ...(query.status !== "all" ? [{ airing: query.status.toUpperCase() as "AIRING" | "FINISHED" | "UPCOMING" }] : []),
          ...(query.type !== "all" ? [{ type: query.type }] : []),
          ...(query.q
            ? [{
                OR: [
                  { title: { contains: query.q, mode: "insensitive" as const } },
                  { titleLocalized: { contains: query.q, mode: "insensitive" as const } },
                  { titleEnglish: { contains: query.q, mode: "insensitive" as const } },
                ],
              }]
            : []),
        ],
      };
      const orderBy: Prisma.AnimeOrderByWithRelationInput[] =
        query.sort === "score"
          ? [{ score: { sort: "desc", nulls: "last" } }, { id: "desc" }]
          : query.sort === "new"
            ? [{ year: { sort: "desc", nulls: "last" } }, { airedFrom: { sort: "desc", nulls: "last" } }, { id: "desc" }]
            : query.sort === "title"
              ? [{ titleLocalized: { sort: "asc", nulls: "last" } }, { title: "asc" }]
              : [{ members: { sort: "desc", nulls: "last" } }, { id: "desc" }];
      const [total, rows] = await Promise.all([
        app.prisma.anime.count({ where }),
        app.prisma.anime.findMany({
          where,
          orderBy,
          skip: (query.page - 1) * STUDIO_PAGE,
          take: STUDIO_PAGE,
          include: {
            ...ANIME_WITH_GENRES_INCLUDE,
            playerSources: { where: { title: { in: titles } }, select: { episodesCount: true } },
          },
        }),
      ]);
      return {
        studio,
        total,
        page: query.page,
        pages: Math.max(1, Math.ceil(total / STUDIO_PAGE)),
        items: rows.map(({ playerSources, ...row }) => ({
          ...toSummaryDto(row),
          dubEpisodes: Math.max(0, ...playerSources.map((source) => source.episodesCount ?? 0)) || null,
        })),
      };
    });
  });
};
