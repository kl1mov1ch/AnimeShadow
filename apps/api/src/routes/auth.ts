import {
  confirmRegistrationInputSchema,
  deleteAccountInputSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  registerInputSchema,
  resendRegistrationInputSchema,
  resetPasswordInputSchema,
  telegramAuthInputSchema,
  verifyEmailInputSchema,
} from "@animeshadow/shared";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";
import { env } from "../config/env.js";

/** Per-IP caps for endpoints that take a password or a 6-digit code — far
 * tighter than the global limit in app.ts, which alone allows brute force. */
function strict(max: number, minutes: number) {
  return { config: { rateLimit: { max, timeWindow: `${minutes} minutes` } } };
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const { auth } = fastify.services;

  // The account's token version goes into every token: raising it (a
  // password reset, a ban) ends all of them — see lib/session-guard.
  const issueToken = async (userId: string) => fastify.jwt.sign({ sub: userId, tv: await auth.tokenVersion(userId) });

  // -- signup: request a code, then confirm it to actually create the account ---

  fastify.post("/auth/register", strict(10, 15), async (request, reply) => {
    const input = parse(registerInputSchema, request.body);
    if (!env.EMAIL_VERIFICATION_REQUIRED) {
      const user = await auth.registerWithoutVerification(input);
      reply.code(201);
      return { token: await issueToken(user.id), user };
    }
    // No token, nobody's signed in yet — only the ticket that binds the
    // emailed code to these details (see AuthService.requestRegistration).
    const { ticket } = await auth.requestRegistration(input);
    reply.code(202);
    return { ticket };
  });

  fastify.post("/auth/register/confirm", strict(20, 15), async (request, reply) => {
    const { email, code, ticket, password } = parse(confirmRegistrationInputSchema, request.body);
    const user = await auth.confirmRegistration(email, code, { ticket, password });
    reply.code(201);
    return { token: await issueToken(user.id), user };
  });

  fastify.post("/auth/register/resend", strict(5, 15), async (request, reply) => {
    const { email } = parse(resendRegistrationInputSchema, request.body);
    await auth.resendRegistrationCode(email);
    reply.code(204);
  });

  fastify.post("/auth/login", strict(15, 15), async (request) => {
    const input = parse(loginInputSchema, request.body);
    const user = await auth.verifyCredentials(input);
    return { token: await issueToken(user.id), user };
  });

  fastify.post("/auth/telegram", strict(30, 15), async (request) => {
    const input = parse(telegramAuthInputSchema, request.body);
    const { referralCode } = parse(z.object({ referralCode: z.string().trim().max(20).optional() }), request.body);
    const user = await auth.loginWithTelegram(input, referralCode);
    return { token: await issueToken(user.id), user };
  });

  fastify.get(
    "/auth/me",
    { preHandler: fastify.authenticate },
    async (request) => {
      const user = await auth.getById(request.userId!);
      return { user };
    },
  );

  fastify.delete(
    "/auth/me",
    { preHandler: fastify.authenticate, ...strict(10, 15) },
    async (request, reply) => {
      const { password } = parse(deleteAccountInputSchema, request.body);
      await auth.deleteAccount(request.userId!, password);
      reply.code(204);
    },
  );

  // -- email verification (accounts created before signup required a code) --

  fastify.post(
    "/auth/verify-email",
    { preHandler: fastify.authenticate, ...strict(20, 15) },
    async (request) => {
      const { code } = parse(verifyEmailInputSchema, request.body);
      const user = await auth.verifyEmail(request.userId!, code);
      return { user };
    },
  );

  fastify.post(
    "/auth/resend-verification",
    { preHandler: fastify.authenticate, ...strict(5, 15) },
    async (request, reply) => {
      await auth.resendVerificationCode(request.userId!);
      reply.code(204);
    },
  );

  // -- password reset (forgot password) ------------------------------------

  fastify.post("/auth/forgot-password", strict(5, 15), async (request, reply) => {
    const { email } = parse(forgotPasswordInputSchema, request.body);
    await auth.requestPasswordReset(email);
    // Same response whether or not the account exists — see AuthService.
    reply.code(204);
  });

  fastify.post("/auth/reset-password", strict(20, 15), async (request, reply) => {
    const { email, code, password } = parse(resetPasswordInputSchema, request.body);
    await auth.resetPassword(email, code, password);
    reply.code(204);
  });
};
