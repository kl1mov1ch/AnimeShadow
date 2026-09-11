import { searchQuerySchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/search", async (request) => {
    const { q, lang, limit, fast } = parse(searchQuerySchema, request.query);
    return fastify.services.search.search(q, lang, limit, fast);
  });
};
