import {
  notificationsReadInputSchema,
  notifySettingsInputSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
  guestPushInputSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";
import { z } from "zod";

/** One's notifications: the list, the unread count (for the bell), marking read. */
export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const { notifications, delivery } = fastify.services;
  const auth = { preHandler: fastify.authenticate };

  fastify.delete("/me/notifications/:id", auth, async (request) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(100) }), request.params);
    return { deleted: await notifications.remove(request.userId!, id) };
  });
  fastify.delete("/me/notifications", auth, async (request) => ({ deleted: await notifications.remove(request.userId!) }));

  fastify.get("/me/notifications", { preHandler: fastify.authenticate }, async (request) => notifications.list(request.userId!));

  fastify.get("/me/notifications/unread", { preHandler: fastify.authenticate }, async (request) => ({
    unread: await notifications.unread(request.userId!),
  }));

  fastify.post("/me/notifications/read", { preHandler: fastify.authenticate }, async (request) => {
    const input = parse(notificationsReadInputSchema, request.body ?? {});
    return { marked: await notifications.markRead(request.userId!, input) };
  });

  // Where new episodes go besides the bell: Telegram and browser push.
  fastify.get("/me/notify-settings", auth, async (request) => delivery.settings(request.userId!));

  fastify.patch("/me/notify-settings", auth, async (request) =>
    delivery.update(request.userId!, parse(notifySettingsInputSchema, request.body ?? {})),
  );

  fastify.post("/me/telegram/link", { ...auth, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!delivery.telegramReady) return reply.code(503).send({ error: { code: "UNAVAILABLE", message: "Telegram-бот не настроен" } });
    return delivery.telegramLink(request.userId!);
  });

  fastify.delete("/me/telegram/link", auth, async (request) => delivery.telegramUnlink(request.userId!));

  fastify.post("/me/push/subscribe", { ...auth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) =>
    delivery.subscribe(request.userId!, parse(pushSubscriptionInputSchema, request.body), request.headers["user-agent"]),
  );

  // Guests: the key, subscribing by browser id, and "off" by the endpoint itself.
  fastify.get("/push/key", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return { publicKey: delivery.publicKey };
  });

  fastify.post("/push/subscribe", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const input = parse(guestPushInputSchema, request.body);
    return delivery.subscribeGuest(input.visitorId, input, request.headers["user-agent"]);
  });

  fastify.post("/push/unsubscribe", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) =>
    delivery.forgetEndpoint(parse(pushUnsubscribeInputSchema, request.body).endpoint),
  );

  fastify.post("/me/push/unsubscribe", auth, async (request) =>
    delivery.unsubscribe(request.userId!, parse(pushUnsubscribeInputSchema, request.body).endpoint),
  );

  fastify.post("/me/push/status", auth, async (request) =>
    delivery.pushStatus(request.userId!, parse(pushUnsubscribeInputSchema, request.body).endpoint),
  );

  fastify.post("/me/notify-test", { ...auth, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (request) => {
    const input = parse(z.object({ channel: z.enum(["all", "telegram", "push"]).default("all") }), request.body ?? {});
    return delivery.test(request.userId!, input.channel);
  });
};
