import { localeQuerySchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

export const discoverRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/discover", async (request) => {
    const { lang } = parse(localeQuerySchema, request.query);
    return fastify.services.catalog.getDiscover(lang);
  });
};
