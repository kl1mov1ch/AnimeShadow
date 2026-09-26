import {
  collectionCommentInputSchema,
  collectionInputSchema,
  collectionQuerySchema,
  collectionRatingSchema,
  collectionViewSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { resolveAllowAdult } from "../lib/content-guard.js";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.string().min(1).max(64) });
const commentParams = z.object({ id: z.string().min(1).max(64), commentId: z.string().min(1).max(64) });

export const collectionRoutes: FastifyPluginAsync = async (fastify) => {
  const { collections } = fastify.services;

  const isAdmin = async (request: FastifyRequest) => {
    if (!request.userId) return false;
    const user = await fastify.prisma.user.findUnique({ where: { id: request.userId }, select: { role: true } });
    return user?.role === "ADMIN";
  };

  // The feed.
  fastify.get("/collections", { preHandler: fastify.optionalAuth }, async (request, reply) => {
    const query = parse(collectionQuerySchema, request.query);
    reply.header("cache-control", request.userId ? "private, max-age=30" : "public, max-age=60");
    return collections.list(query, request.userId);
  });

  fastify.get("/collections/:id", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(idParams, request.params);
    const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
    return collections.detail(id, request.userId, await isAdmin(request), allowAdult);
  });

  fastify.get("/users/:id/collections", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(idParams, request.params);
    return collections.byUser(id, request.userId);
  });

  fastify.get("/me/collections/stats", { preHandler: fastify.authenticate }, async (request) =>
    collections.myStats(request.userId!),
  );

  fastify.get("/collections/:id/stats", { preHandler: fastify.authenticate }, async (request) => {
    const { id } = parse(idParams, request.params);
    return collections.stats(request.userId!, id, await isAdmin(request));
  });

  fastify.post(
    "/collections",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = parse(collectionInputSchema, request.body);
      reply.code(201);
      return collections.create(request.userId!, input);
    },
  );

  fastify.put(
    "/collections/:id",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const input = parse(collectionInputSchema, request.body);
      return collections.update(request.userId!, id, input, await isAdmin(request));
    },
  );

  fastify.delete("/collections/:id", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await collections.remove(request.userId!, id, await isAdmin(request));
    reply.code(204);
    return null;
  });

  fastify.put("/collections/:id/rating", { preHandler: fastify.authenticate }, async (request) => {
    const { id } = parse(idParams, request.params);
    const { value } = parse(collectionRatingSchema, request.body);
    return collections.rate(request.userId!, id, value);
  });

  fastify.get("/collections/:id/comments", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(idParams, request.params);
    return collections.comments(id, request.userId, await isAdmin(request));
  });

  fastify.post(
    "/collections/:id/comments",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = parse(idParams, request.params);
      const { body, parentId } = parse(collectionCommentInputSchema, request.body);
      reply.code(201);
      return collections.addComment(request.userId!, id, body, parentId);
    },
  );

  fastify.delete("/collections/:id/comments/:commentId", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { commentId } = parse(commentParams, request.params);
    await collections.removeComment(request.userId!, commentId, await isAdmin(request));
    reply.code(204);
    return null;
  });

  // Counted once per visitor per day; the author's own visits don't count.
  fastify.post(
    "/collections/:id/view",
    { preHandler: fastify.optionalAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = parse(idParams, request.params);
      const { visitorId } = parse(collectionViewSchema, request.body);
      await collections.recordView(id, visitorId, request.userId);
      reply.code(204);
      return null;
    },
  );
};
