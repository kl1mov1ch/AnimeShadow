import fastifyJwt from "@fastify/jwt";
import type { preHandlerHookHandler } from "fastify";
import fp from "fastify-plugin";
import { env } from "../config/env.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { sessionIsValid } from "../lib/session-guard.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    /** `tv`: the account's tokenVersion when the token was issued (absent
     * on tokens from before it existed, which count as version 0). */
    payload: { sub: string; tv?: number };
    user: { sub: string; tv?: number };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler that requires a valid bearer token. */
    authenticate: preHandlerHookHandler;
    /** preHandler that attaches the user when a token is present, else continues. */
    optionalAuth: preHandlerHookHandler;
    /** preHandler for /admin/* — run *after* `authenticate`. Looks the
     * caller's role up fresh on every request (never trusts a claim baked
     * into the JWT), so a demoted admin loses access on their very next
     * request rather than whenever their token happens to expire. */
    requireAdmin: preHandlerHookHandler;
  }
  interface FastifyRequest {
    /** Set by `authenticate` / `optionalAuth`; the authenticated user id. */
    userId?: string;
  }
}

export default fp(
  async (fastify) => {
    await fastify.register(fastifyJwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: env.JWT_EXPIRES_IN },
    });

    // A valid signature is not enough: the account may have been banned,
    // or every session ended by a password reset (lib/session-guard).
    fastify.decorate("authenticate", async (request) => {
      try {
        await request.jwtVerify();
      } catch {
        throw new UnauthorizedError();
      }
      if (!(await sessionIsValid(fastify.prisma, request.user.sub, request.user.tv ?? 0))) {
        throw new UnauthorizedError("Your session has ended. Please sign in again.");
      }
      request.userId = request.user.sub;
    });

    fastify.decorate("optionalAuth", async (request) => {
      request.userId = undefined;
      if (!request.headers.authorization) return;
      try {
        await request.jwtVerify();
      } catch {
        return;
      }
      if (await sessionIsValid(fastify.prisma, request.user.sub, request.user.tv ?? 0)) {
        request.userId = request.user.sub;
      }
    });

    fastify.decorate("requireAdmin", async (request) => {
      if (!request.userId) throw new UnauthorizedError();
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.userId },
        select: { role: true },
      });
      if (user?.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required.");
      }
    });
  },
  { name: "auth", dependencies: ["prisma"] },
);
