import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
import { GifLibrary } from "../lib/gif-library.js";
import {
  pooledReactionGif,
  isReactionCategory,
  randomReactionCategory,
} from "../lib/reaction-gif.js";

/**
 * Purely decorative reaction gifs (nekos.best) for spots that have no real
 * anime/character to show — an empty search, an error, an achievement
 * unlock. Never used where the image needs to represent a *specific* title
 * or character: nekos.best has no such lookup, only mood/action categories
 * loosely tagged by which show a clip came from.
 */
export const funRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/fun/reaction", async (request, reply) => {
    const q = request.query as { category?: string };
    const category = isReactionCategory(q.category)
      ? q.category
      : randomReactionCategory();

    const url = await pooledReactionGif(category);
    if (!url) {
      request.log.warn({ category }, "reaction gif fetch failed");
      reply.code(502);
      return {
        error: { code: "UPSTREAM_UNAVAILABLE", message: "Reaction gif unavailable" },
      };
    }

    // A different gif now and then, but not a request per page view.
    reply.header("cache-control", "public, max-age=300");
    return { url, category };
  });

  // The site's own gif library (see lib/gif-library.ts): what is on disk
  // now, then filled in the background — never in the way of a request.
  const gifs = new GifLibrary(join(env.IMAGE_CACHE_DIR ?? join(process.cwd(), "cache", "img"), "..", "gifs"));
  await gifs.load();
  const firstBuild = setTimeout(() => void gifs.build().catch(() => undefined), 20_000);
  const weekly = setInterval(() => void gifs.build().catch(() => undefined), 24 * 60 * 60_000);
  firstBuild.unref();
  weekly.unref();
  fastify.addHook("onClose", async () => {
    clearTimeout(firstBuild);
    clearInterval(weekly);
  });

  fastify.get("/gifs", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=3600");
    return { categories: gifs.list() };
  });

  fastify.get("/gifs/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    const still = (request.query as { still?: string }).still === "1";
    const buf = await (still ? gifs.still(name) : gifs.file(name));
    if (!buf) {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "No such gif" } };
    }
    // The name is the content's hash: it never changes, so the browser keeps it a year.
    return reply
      .header("content-type", "image/webp")
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("cross-origin-resource-policy", "cross-origin")
      .send(buf);
  });

  // "Did you know": facts read off the catalogue, dealt at random.
  fastify.get("/fun/facts", async (request, reply) => {
    const raw = Number((request.query as { count?: string }).count);
    const count = Number.isFinite(raw) ? Math.min(12, Math.max(1, Math.floor(raw))) : 4;
    reply.header("cache-control", "no-store");
    return fastify.services.facts.random(count);
  });
};
