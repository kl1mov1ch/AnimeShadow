import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";

/**
 * The homepage hero's clips (see HeroClipService): which titles have one,
 * and the files themselves — with byte ranges, which Safari insists on
 * before it will play a video at all.
 */
export const heroRoutes: FastifyPluginAsync = async (fastify) => {
  const { heroClips } = fastify.services;

  fastify.get("/hero-clips", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return heroClips.list();
  });

  fastify.get("/hero/:file", async (request, reply) => {
    const path = heroClips.path((request.params as { file: string }).file);
    const info = path ? await stat(path).catch(() => null) : null;
    if (!path || !info) {
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
