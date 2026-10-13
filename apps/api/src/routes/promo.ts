import { PROMO, type PromoState } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { BadRequestError } from "../lib/errors.js";
import { trialEnd } from "../lib/pro.js";

/**
 * The welcome offer for a signed-in account: where it stands (free month
 * running, half-price second month on offer, used, or never taken), and a
 * way for an account made before the offer to take the free month — once.
 */
export const promoRoutes: FastifyPluginAsync = async (fastify) => {
  const state = (user: { proSince: Date | null; trialUntil: Date | null }, now = new Date()): PromoState => {
    if (user.proSince) return { phase: "pro", trialUntil: null, discountUntil: null };
    if (!user.trialUntil) return { phase: "claimable", trialUntil: null, discountUntil: null };
    const discountUntil = new Date(user.trialUntil.getTime() + PROMO.discountDays * 86_400_000);
    const phase = user.trialUntil > now ? "trial" : discountUntil > now ? "discount" : "used";
    return { phase, trialUntil: user.trialUntil.toISOString(), discountUntil: discountUntil.toISOString() };
  };

  fastify.get("/promo", { preHandler: fastify.authenticate }, async (request) => {
    const user = await fastify.prisma.user.findUniqueOrThrow({
      where: { id: request.userId! },
      select: { proSince: true, trialUntil: true },
    });
    return state(user);
  });

  fastify.post("/promo/claim", { preHandler: fastify.authenticate }, async (request) => {
    // Only where it was never set: the update matches nothing for an account
    // that already had its month, so two clicks can't stack two months.
    const { count } = await fastify.prisma.user.updateMany({
      where: { id: request.userId!, trialUntil: null, proSince: null },
      data: { trialUntil: trialEnd() },
    });
    if (count === 0) throw new BadRequestError("Подарочный месяц уже был использован.");
    const user = await fastify.prisma.user.findUniqueOrThrow({
      where: { id: request.userId! },
      select: { proSince: true, trialUntil: true },
    });
    return state(user);
  });
};
