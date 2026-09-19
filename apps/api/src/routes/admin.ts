import {
  adminCommentQuerySchema,
  adminSetPasswordInputSchema,
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
  const { admin, comments } = fastify.services;
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

  fastify.get("/admin/users/:id", guard, async (request) => {
    const { id } = parse(idParams, request.params);
    return admin.userDetail(id);
  });

  fastify.post(
    "/admin/users/:id/password",
    // Tighter than the admin routes' default: this is the one that hands
    // over an account, so a leaked admin session should not get to brute
    // through many of them quickly.
    { ...guard, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const { password } = parse(adminSetPasswordInputSchema, request.body);
      return admin.setPassword(request.userId!, id, password);
    },
  );

  fastify.get("/admin/comments", guard, async (request) => {
    const query = parse(adminCommentQuerySchema, request.query);
    return admin.listComments(query);
  });

  fastify.delete("/admin/comments/:id", guard, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await comments.adminRemove(id);
    reply.code(204);
  });
};
