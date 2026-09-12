import type { FastifyPluginAsync } from "fastify";

/**
 * Purely decorative reaction gifs (nekos.best) for spots that have no real
 * anime/character to show — an empty search, an error, an achievement
 * unlock. Never used where the image needs to represent a *specific* title
 * or character: nekos.best has no such lookup, only mood/action categories
 * loosely tagged by which show a clip came from.
 */
const REACTION_CATEGORIES = [
  "happy",
  "dance",
  "wave",
  "confused",
  "shrug",
  "cry",
  "think",
  "smile",
  "highfive",
  "bored",
] as const;
type ReactionCategory = (typeof REACTION_CATEGORIES)[number];

const NEKOS_UA = "AnimeShadow (https://fiat-legacy.xyz)";

function isReactionCategory(value: unknown): value is ReactionCategory {
  return (
    typeof value === "string" &&
    (REACTION_CATEGORIES as readonly string[]).includes(value)
  );
}

export const funRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/fun/reaction", async (request, reply) => {
    const q = request.query as { category?: string };
    const category = isReactionCategory(q.category)
      ? q.category
      : REACTION_CATEGORIES[Math.floor(Math.random() * REACTION_CATEGORIES.length)]!;

    try {
      const res = await fetch(
        `https://nekos.best/api/v2/${category}?amount=1`,
        {
          headers: { "user-agent": NEKOS_UA, accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) throw new Error(`nekos.best responded ${res.status}`);
      const json = (await res.json()) as {
        results?: Array<{ url?: string }>;
      };
      const url = json.results?.[0]?.url;
      if (!url) throw new Error("empty result");

      reply.header("cache-control", "no-store");
      return { url, category };
    } catch (error) {
      request.log.warn({ error, category }, "reaction gif fetch failed");
      reply.code(502);
      return {
        error: { code: "UPSTREAM_UNAVAILABLE", message: "Reaction gif unavailable" },
      };
    }
  });
};
