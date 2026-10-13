import { createProfileReportInputSchema, createWallPostInputSchema, followKindSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const userParams = z.object({ id: z.string().min(1).max(64) });
const postParams = z.object({ postId: z.string().min(1).max(64) });
const listQuery = z.object({ kind: followKindSchema.default("followers") });
const wallQuery = z.object({ cursor: z.string().min(1).max(64).optional() });

/** Following, friends, the profile wall and friends' activity. */
export const socialRoutes: FastifyPluginAsync = async (fastify) => {
  const social = fastify.services.social;

  fastify.get("/users/:id/social", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userParams, request.params);
    return social.summary(id, request.userId ?? null);
  });

  fastify.get("/users/:id/people", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userParams, request.params);
    const { kind } = parse(listQuery, request.query);
    return { items: await social.list(id, kind, request.userId ?? null) };
  });

  fastify.post(
    "/users/:id/follow",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(userParams, request.params);
      return social.follow(request.userId!, id);
    },
  );

  fastify.delete(
    "/users/:id/follow",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(userParams, request.params);
      return social.unfollow(request.userId!, id);
    },
  );

  fastify.get("/users/:id/wall", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userParams, request.params);
    const { cursor } = parse(wallQuery, request.query);
    return social.wall(id, request.userId ?? null, cursor ?? null);
  });

  // A few a minute per address: one script could otherwise flood a wall.
  fastify.post(
    "/users/:id/wall",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = parse(userParams, request.params);
      const { body } = parse(createWallPostInputSchema, request.body);
      reply.code(201);
      return social.post(id, request.userId!, body);
    },
  );

  fastify.delete(
    "/wall/:postId",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { postId } = parse(postParams, request.params);
      await social.remove(postId, request.userId!);
      reply.code(204);
    },
  );

  // A handful an hour is plenty for an honest person.
  fastify.post(
    "/users/:id/report",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const { id } = parse(userParams, request.params);
      const input = parse(createProfileReportInputSchema, request.body);
      reply.code(201);
      return social.report(request.userId!, id, input);
    },
  );

  // Find people by nick or name (the search window's "People").
  fastify.get(
    "/people/search",
    { preHandler: fastify.optionalAuth, config: { rateLimit: { max: 90, timeWindow: "1 minute" } } },
    async (request) => {
      const { q } = parse(z.object({ q: z.string().trim().min(1).max(60) }), request.query);
      return { items: await social.searchPeople(q, request.userId ?? null) };
    },
  );

  fastify.get("/people/suggested", { preHandler: fastify.optionalAuth }, async (request) => {
    return { items: await social.suggestions(request.userId ?? null) };
  });

  fastify.get("/me/friends/activity", { preHandler: fastify.authenticate }, async (request) => {
    return { items: await social.friendsActivity(request.userId!) };
  });
};
