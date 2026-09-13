import {
  adminContentQuerySchema,
  adminUpdateUserInputSchema,
  adminUserQuerySchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.string().min(1) });

/** Every route here requires a fresh, DB-checked ADMIN role — see
 * requireAdmin in plugins/auth.ts. */
export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const { admin, comments, reviews } = fastify.services;
  const guard = { preHandler: [fastify.authenticate, fastify.requireAdmin] };

  fastify.get("/admin/overview", guard, async () => admin.overview());

  fastify.get("/admin/users", guard, async (request) => {
    const query = parse(adminUserQuerySchema, request.query);
    return admin.listUsers(query);
  });

  fastify.patch("/admin/users/:id", guard, async (request) => {
    const { id } = parse(idParams, request.params);
    const input = parse(adminUpdateUserInputSchema, request.body);
    return admin.updateUser(request.userId!, id, input);
  });

  fastify.get("/admin/comments", guard, async (request) => {
    const query = parse(adminContentQuerySchema, request.query);
    return admin.listComments(query);
  });

  fastify.delete("/admin/comments/:id", guard, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await comments.adminRemove(id);
    reply.code(204);
  });

  fastify.get("/admin/reviews", guard, async (request) => {
    const query = parse(adminContentQuerySchema, request.query);
    return admin.listReviews(query);
  });

  fastify.delete("/admin/reviews/:id", guard, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await reviews.adminRemove(id);
    reply.code(204);
  });
};
