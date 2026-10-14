import { notificationsReadInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

/** One's notifications: the list, the unread count (for the bell), marking read. */
export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const { notifications } = fastify.services;

  fastify.get("/me/notifications", { preHandler: fastify.authenticate }, async (request) => notifications.list(request.userId!));

  fastify.get("/me/notifications/unread", { preHandler: fastify.authenticate }, async (request) => ({
    unread: await notifications.unread(request.userId!),
  }));

  fastify.post("/me/notifications/read", { preHandler: fastify.authenticate }, async (request) => {
    const input = parse(notificationsReadInputSchema, request.body ?? {});
    return { marked: await notifications.markRead(request.userId!, input) };
  });
};
