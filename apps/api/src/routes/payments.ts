import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { LEGAL_VERSION } from "@animeshadow/shared";
import { env } from "../config/env.js";
import { parse } from "../lib/validation.js";
import { MulenPayService } from "../services/mulenpay.service.js";

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  const payments = new MulenPayService(fastify.prisma, {
    enabled: env.MULENPAY_ENABLED, apiKey: env.MULENPAY_API_KEY, secretKey: env.MULENPAY_SECRET_KEY,
    shopId: env.MULENPAY_SHOP_ID, prices: env.MULENPAY_PRICES_RUB,
  });
  fastify.get("/payments/plans", { preHandler: fastify.optionalAuth }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    return payments.plans(request.userId);
  });
  fastify.post("/payments", { preHandler: fastify.authenticate, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (request, reply) => {
    const input = parse(z.object({ months: z.union([z.literal(1), z.literal(3), z.literal(12)]), requestId: z.string().uuid(), consent: z.literal(true), consentVersion: z.literal(LEGAL_VERSION), expectedAmountMinor: z.number().int().positive() }), request.body);
    const result = await payments.create(request.userId!, input.months, input.requestId, input.expectedAmountMinor);
    reply.code(201).header("cache-control", "private, no-store");
    return result;
  });
  fastify.get("/payments/:id", { preHandler: fastify.authenticate, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    reply.header("cache-control", "private, no-store");
    return payments.verify(id, request.userId!);
  });
  fastify.post("/payments/mulenpay/callback", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), request.body);
    await payments.callback(id);
    return { success: true };
  });
};
