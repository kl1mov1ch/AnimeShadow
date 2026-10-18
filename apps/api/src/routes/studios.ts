import type { FastifyPluginAsync } from "fastify";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere } from "../lib/content-guard.js";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { kodikMasterPlaylist } from "../services/kodik-streams.js";

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
};
