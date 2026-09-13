import {
  logSessionInputSchema,
  setUsernameInputSchema,
  updateProfileInputSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const usernameParams = z.object({ username: z.string().min(1) });
const avatarBody = z.object({ dataUrl: z.string().min(30) });

export const profileRoutes: FastifyPluginAsync = async (fastify) => {
  const { profile, achievements } = fastify.services;

  fastify.get("/me/profile", { preHandler: fastify.authenticate }, async (request) =>
    profile.getMine(request.userId!),
  );

  fastify.patch(
    "/me/profile",
    { preHandler: fastify.authenticate },
    async (request) => {
      const input = parse(updateProfileInputSchema, request.body);
      return profile.update(request.userId!, input);
    },
  );

  fastify.put(
    "/me/username",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { username } = parse(setUsernameInputSchema, request.body);
      return profile.setUsername(request.userId!, username);
    },
  );

  fastify.post(
    "/me/avatar",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { dataUrl } = parse(avatarBody, request.body);
      return profile.setAvatar(request.userId!, dataUrl);
    },
  );

  fastify.post(
    "/me/avatar/random",
    { preHandler: fastify.authenticate },
    async (request) => profile.setRandomAvatar(request.userId!),
  );

  fastify.get(
    "/me/progress",
    { preHandler: fastify.authenticate },
    async (request) => profile.progress(request.userId!),
  );

  fastify.get(
    "/me/achievements",
    { preHandler: fastify.authenticate },
    async (request) => achievements.list(request.userId!),
  );

  fastify.post(
    "/me/session",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const input = parse(logSessionInputSchema, request.body);
      await profile.logSession(request.userId!, input);
      void achievements.recompute(request.userId!).catch(() => {});
      reply.code(204);
      return null;
    },
  );

  // Public profile by username.
  fastify.get("/profile/:username", async (request) => {
    const { username } = parse(usernameParams, request.params);
    return profile.getByUsername(username.replace(/^@/, ""));
  });
};
