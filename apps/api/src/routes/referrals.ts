import { referralClaimInputSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { claimReferralReward, referralLeaders, referralState, referrerFor } from "../lib/referral.js";
import { parse } from "../lib/validation.js";

/** Invites: the account's code and ladders, taking a reward, and checking a friend's code. */
export const referralRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/referrals/me", { preHandler: fastify.authenticate }, async (request) =>
    referralState(fastify.prisma, request.userId!),
  );

  fastify.post(
    "/referrals/claim",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const { rewardId } = parse(referralClaimInputSchema, request.body);
      return claimReferralReward(fastify.prisma, request.userId!, rewardId);
    },
  );

  // Who brought the most friends, and where the viewer stands.
  fastify.get("/referrals/leaders", { preHandler: fastify.authenticate }, async (request, reply) => {
    reply.header("cache-control", "private, max-age=60");
    return referralLeaders(fastify.prisma, request.userId!);
  });

  // For the sign-up form: whose code this is, so it can say "from <name>".
  fastify.get(
    "/referrals/check",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const { code } = parse(z.object({ code: z.string().trim().max(20) }), request.query);
      const id = await referrerFor(fastify.prisma, code);
      if (!id) return { valid: false, name: null };
      const owner = await fastify.prisma.user.findUnique({ where: { id }, select: { displayName: true } });
      return { valid: true, name: owner?.displayName ?? null };
    },
  );
};
