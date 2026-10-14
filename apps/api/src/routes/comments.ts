import {
  commentQuerySchema,
  createCommentInputSchema,
  createCommentReportInputSchema,
  editCommentInputSchema,
  voteCommentInputSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const animeIdParams = z.object({ id: z.coerce.number().int().positive() });
const commentIdParams = z.object({ id: z.string().min(1) });

export const commentRoutes: FastifyPluginAsync = async (fastify) => {
  const { comments } = fastify.services;

  fastify.get(
    "/anime/:id/comments",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { id } = parse(animeIdParams, request.params);
      const query = parse(commentQuerySchema, request.query);
      return comments.list(id, query, request.userId);
    },
  );

  // Per-address caps on writing: the global 600 a minute would let one
  // script flood a page with comments or votes.
  fastify.post(
    "/comments",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = parse(createCommentInputSchema, request.body);
      // Achievements are re-checked by the service.
      const comment = await comments.create(request.userId!, input);
      reply.code(201);
      return comment;
    },
  );

  fastify.patch(
    "/comments/:id",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(commentIdParams, request.params);
      const { body } = parse(editCommentInputSchema, request.body);
      return comments.edit(request.userId!, id, body);
    },
  );

  fastify.delete(
    "/comments/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { id } = parse(commentIdParams, request.params);
      await comments.remove(request.userId!, id);
      reply.code(204);
      return null;
    },
  );

  fastify.post(
    "/comments/:id/report",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(commentIdParams, request.params);
      const input = parse(createCommentReportInputSchema, request.body);
      return comments.report(request.userId!, id, input);
    },
  );

  fastify.post(
    "/comments/:id/vote",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(commentIdParams, request.params);
      const { value } = parse(voteCommentInputSchema, request.body);
      return comments.vote(request.userId!, id, value);
    },
  );
};
