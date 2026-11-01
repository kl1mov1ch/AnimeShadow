import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import { NotFoundError, UpstreamUnavailableError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";
import { AnimeMusicService } from "../services/anime-music.js";

export const animeMusicRoutes: FastifyPluginAsync = async (app) => {
  const music = new AnimeMusicService();
  const assertVisible = async (
    id: number,
    userId: string | undefined,
    dob: unknown,
  ) => {
    const allowAdult = await resolveAllowAdult(
      app.prisma,
      userId,
      dob as string | undefined,
    );
    const anime = await app.prisma.anime.findFirst({
      where: { id, ...contentGuardWhere(allowAdult) },
      select: { id: true },
    });
    if (!anime) throw new NotFoundError("Аниме не найдено.");
  };
  app.get("/anime/:id/music", { preHandler: app.optionalAuth }, async (req, reply) => {
    const { id } = parse(
      z.object({ id: z.coerce.number().int().positive() }),
      req.params,
    );
    await assertVisible(id, req.userId, req.headers["x-adult-dob"]);
    const result = await music.list(id);
    const payload = { sub: `music:${id}`, purpose: "anime-music", animeId: id };
    const ticket = app.jwt.sign(payload, { expiresIn: "2h" });
    reply.header("cache-control", "private, no-store");
    return {
      ...result,
      items: result.items.map((track) => ({
        ...track,
        url: `${track.url}?ticket=${ticket}`,
        fallbackUrl: track.fallbackUrl ? `${track.fallbackUrl}?ticket=${ticket}` : null,
      })),
    };
  });
  // Same-origin media works in production without third-party CORS or hotlink requirements.
  app.get(
    "/anime/:id/music/:index/:format",
    {
      preHandler: app.optionalAuth,
      config: { rateLimit: { max: 180, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { id, index, format } = parse(
        z.object({
          id: z.coerce.number().int().positive(),
          index: z.coerce.number().int().min(0).max(59),
          format: z.enum(["audio", "video"]),
        }),
        req.params,
      );
      const { ticket } = parse(
        z.object({ ticket: z.string().max(2048).optional() }),
        req.query,
      );
      let permitted = false;
      if (ticket) {
        try {
          const claims = app.jwt.verify<{ purpose: string; animeId: number }>(ticket);
          permitted = claims.purpose === "anime-music" && claims.animeId === id;
        } catch {
          /* Expired tickets fall back to the normal content guard. */
        }
      }
      if (!permitted) await assertVisible(id, req.userId, req.headers["x-adult-dob"]);
      const range = req.headers.range;
      if (range && !/^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/.test(range))
        return reply.code(416).send();
      const abort = new AbortController();
      const onClose = () => {
        if (!reply.raw.writableFinished) abort.abort();
      };
      reply.raw.once("close", onClose);
      let response: Response;
      try {
        response = await fetch(await music.media(id, index, format), {
          method: req.method === "HEAD" ? "HEAD" : "GET",
          redirect: "error",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60_000)]),
          headers: {
            ...(range ? { range } : {}),
            "user-agent": "AnimeShadow music player (+https://animeshadow.online)",
            accept: "audio/*,video/webm,*/*;q=0.5",
          },
        });
      } catch (error) {
        reply.raw.off("close", onClose);
        if (error instanceof NotFoundError) throw error;
        throw new UpstreamUnavailableError(
          "Не удалось загрузить опенинг. Попробуйте другой трек.",
        );
      }
      if (response.status === 416) {
        void response.body?.cancel();
        return reply.code(416).send();
      }
      const type = response.headers.get("content-type")?.split(";")[0] ?? "";
      if (
        ![200, 206].includes(response.status) ||
        !/^(?:audio\/|video\/webm|application\/ogg)/.test(type)
      ) {
        void response.body?.cancel();
        throw new UpstreamUnavailableError(
          "Архив временно не отдаёт этот опенинг. Повторите попытку.",
        );
      }
      reply
        .code(response.status)
        .type(type)
        .header("cache-control", "private, max-age=3600");
      for (const header of ["content-length", "content-range", "accept-ranges"]) {
        const value = response.headers.get(header);
        if (value) reply.header(header, value);
      }
      if (req.method === "HEAD" || !response.body) {
        void response.body?.cancel();
        return reply.send();
      }
      return reply.send(Readable.fromWeb(response.body as unknown as ReadableStream));
    },
  );
};
