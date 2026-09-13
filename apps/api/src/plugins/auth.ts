import fastifyJwt from "@fastify/jwt";
import type { preHandlerHookHandler } from "fastify";
import fp from "fastify-plugin";
import { env } from "../config/env.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
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

    fastify.decorate("authenticate", async (request) => {
      try {
        await request.jwtVerify();
        request.userId = request.user.sub;
      } catch {
        throw new UnauthorizedError();
      }
    });

    fastify.decorate("optionalAuth", async (request) => {
      try {
        await request.jwtVerify();
        request.userId = request.user.sub;
      } catch {
        request.userId = undefined;
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
