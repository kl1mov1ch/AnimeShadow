import fastifyJwt from "@fastify/jwt";
import type { preHandlerHookHandler } from "fastify";
import fp from "fastify-plugin";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../lib/errors.js";

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
  },
  { name: "auth" },
);
