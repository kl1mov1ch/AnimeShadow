import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import { PreviewService } from "../services/preview.service.js";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";

/**
 * The homepage hero's clips (see HeroClipService): which titles have one,
 * and the files themselves — with byte ranges, which Safari insists on
 * before it will play a video at all.
 */
export const heroRoutes: FastifyPluginAsync = async (fastify) => {
  const { heroClips } = fastify.services;
  const previews = new PreviewService();

  fastify.get("/anime/:id/preview", { preHandler: fastify.optionalAuth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isSafeInteger(id) || id < 1) return reply.code(400).send({ preview: null });
    // No background crawl: one selected, existing title per visitor action.
    const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId, request.headers["x-adult-dob"]);
    const anime = await fastify.prisma.anime.findFirst({ where: { id, ...contentGuardWhere(allowAdult) }, select: { id: true } });
    if (!anime) return reply.code(404).send({ preview: null });
    reply.header("cache-control", "private, max-age=600");
    return { preview: await previews.get(id) };
  });

  fastify.get("/hero-clips", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return heroClips.list();
  });

  fastify.get("/hero/:file", async (request, reply) => {
    const path = heroClips.path((request.params as { file: string }).file);
    const info = path ? await stat(path).catch(() => null) : null;
    if (!path || !info || info.size > 3 * 1024 * 1024) {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "No such clip" } };
    }
    const size = info.size;
    // The name changes with the clip, so a name always means the same bytes.
    reply
      .header("content-type", "video/mp4")
      .header("accept-ranges", "bytes")
      .header("cache-control", "public, max-age=604800, immutable");

    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (!range) {
      reply.header("content-length", size);
      return reply.send(createReadStream(path));
    }
    let start = range[1] ? Number(range[1]) : size - Number(range[2] || 0);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) {
      reply.code(416).header("content-range", `bytes */${size}`);
      return reply.send();
    }
    reply
      .code(206)
      .header("content-range", `bytes ${start}-${end}/${size}`)
      .header("content-length", end - start + 1);
    return reply.send(createReadStream(path, { start, end }));
  });
};
