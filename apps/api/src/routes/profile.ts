import {
  libraryImportInputSchema,
  libraryStatusSchema,
  logSessionInputSchema,
  setUsernameInputSchema,
  updateProfileInputSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validation.js";

const usernameParams = z.object({ username: z.string().min(1) });
const userIdParams = z.object({ id: z.string().min(1) });
const avatarBody = z.object({ dataUrl: z.string().min(30) });
const IMAGE_BODY_LIMIT = 9 * 1024 * 1024;

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
    // The default 1MB is less than a cropped photo can come to in base64.
    { preHandler: fastify.authenticate, bodyLimit: IMAGE_BODY_LIMIT },
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

  fastify.post(
    "/me/banner",
    { preHandler: fastify.authenticate, bodyLimit: IMAGE_BODY_LIMIT },
    async (request) => {
      const { dataUrl } = parse(avatarBody, request.body);
      return profile.setBanner(request.userId!, dataUrl);
    },
  );

  fastify.post(
    "/me/banner/random",
    { preHandler: fastify.authenticate },
    async (request) => profile.setRandomBanner(request.userId!),
  );

  fastify.delete(
    "/me/banner",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      await profile.removeBanner(request.userId!);
      reply.code(204);
      return null;
    },
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
  fastify.get("/profile/:username", { preHandler: fastify.optionalAuth }, async (request) => {
    const { username } = parse(usernameParams, request.params);
    return profile.getByUsername(username.replace(/^@/, ""), request.userId);
  });

  // Same thing by id — for a comment author who hasn't claimed a username.
  fastify.get("/users/:id/public-profile", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userIdParams, request.params);
    return profile.getById(id, request.userId);
  });

  // --- the profile's history: year, feed, list, now watching, comparison ---
  const { insights } = fastify.services;
  const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
  const listQuery = z.object({ status: libraryStatusSchema.optional() });

  fastify.get("/users/:id/year", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userIdParams, request.params);
    const { year } = parse(yearQuery, request.query);
    return insights.year(id, request.userId ?? null, year ?? new Date().getUTCFullYear());
  });

  fastify.get("/users/:id/feed", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userIdParams, request.params);
    return { items: await insights.feed(id, request.userId ?? null) };
  });

  fastify.get("/users/:id/list", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userIdParams, request.params);
    const { status } = parse(listQuery, request.query);
    return { items: await insights.publicList(id, request.userId ?? null, status) };
  });

  fastify.get("/users/:id/watching", { preHandler: fastify.optionalAuth }, async (request) => {
    const { id } = parse(userIdParams, request.params);
    return { items: await insights.watching(id, request.userId ?? null) };
  });

  fastify.get("/users/:id/compare", { preHandler: fastify.authenticate }, async (request) => {
    const { id } = parse(userIdParams, request.params);
    return insights.compare(id, request.userId!);
  });

  // --- moving a list in and out ---
  fastify.get("/me/library/export", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { format } = parse(z.object({ format: z.enum(["json", "mal"]).default("json") }), request.query);
    const file = await insights.exportList(request.userId!, format);
    reply.header("content-type", `${file.type}; charset=utf-8`);
    reply.header("content-disposition", `attachment; filename="${file.name}"`);
    return file.body;
  });

  fastify.post(
    "/me/library/import",
    { preHandler: fastify.authenticate, bodyLimit: 6 * 1024 * 1024 },
    async (request) => {
      const input = parse(libraryImportInputSchema, request.body);
      return insights.importList(request.userId!, input);
    },
  );
};
