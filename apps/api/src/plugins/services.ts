import fp from "fastify-plugin";
import { env } from "../config/env.js";
import { jikan } from "../services/jikan.js";
import { createServices, type Services } from "../services/container.js";

declare module "fastify" {
  interface FastifyInstance {
    services: Services;
  }
}

export default fp(
  async (fastify) => {
    const services = createServices({
      prisma: fastify.prisma,
      jikan,
      logger: fastify.log,
      cacheTtlSeconds: env.ANIME_CACHE_TTL_SECONDS,
      proForAll: env.PRO_FOR_ALL,
      translate: {
        enabled: env.TRANSLATE_ENABLED,
        email: env.MYMEMORY_EMAIL,
      },
      shikimori: {
        baseUrl: env.SHIKIMORI_BASE_URL,
        userAgent: env.SHIKIMORI_USER_AGENT,
      },
      watch: {
        kodikToken: env.KODIK_API_TOKEN,
        kodikBase: env.KODIK_API_BASE,
        allohaToken: env.ALLOHA_TOKEN,
        embedTemplate: env.WATCH_EMBED_TEMPLATE,
      },
      telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    });
    fastify.decorate("services", services);
  },
  { name: "services", dependencies: ["prisma"] },
);
