import type { FastifyPluginAsync } from "fastify";
import {
  fetchReactionGif,
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

    const url = await fetchReactionGif(category);
    if (!url) {
      request.log.warn({ category }, "reaction gif fetch failed");
      reply.code(502);
      return {
        error: { code: "UPSTREAM_UNAVAILABLE", message: "Reaction gif unavailable" },
      };
    }

    reply.header("cache-control", "no-store");
    return { url, category };
  });
};
