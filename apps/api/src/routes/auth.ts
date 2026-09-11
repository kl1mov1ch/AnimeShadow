import { loginInputSchema, registerInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const { auth } = fastify.services;

  const issueToken = (userId: string) => fastify.jwt.sign({ sub: userId });

  fastify.post("/auth/register", async (request, reply) => {
    const input = parse(registerInputSchema, request.body);
    const user = await auth.register(input);
    reply.code(201);
    return { token: issueToken(user.id), user };
  });

  fastify.post("/auth/login", async (request) => {
    const input = parse(loginInputSchema, request.body);
    const user = await auth.verifyCredentials(input);
    return { token: issueToken(user.id), user };
  });

  fastify.get(
    "/auth/me",
    { preHandler: fastify.authenticate },
    async (request) => {
      const user = await auth.getById(request.userId!);
      return { user };
    },
  );
};
