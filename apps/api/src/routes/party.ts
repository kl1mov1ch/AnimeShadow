import {
  createPartyInputSchema,
  partyChatInputSchema,
  partyNetInputSchema,
  partyPlaybackInputSchema,
  partyReactionInputSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";

const codeParams = z.object({ code: z.string().min(4).max(16).regex(/^[\w-]+$/) });

/** Watching together: rooms, their event stream, playback, chat, reactions. */
export const partyRoutes: FastifyPluginAsync = async (fastify) => {
  const { party } = fastify.services;
  const auth = { preHandler: fastify.authenticate };

  fastify.post("/party", { ...auth, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const input = parse(createPartyInputSchema, request.body);
    return party.create(request.userId!, input.animeId, input.episode);
  });

  fastify.get("/party/:code", auth, async (request) => party.snapshot(parse(codeParams, request.params).code));

  // The room's live stream (server-sent events), taken over from Fastify so
  // nothing — compression included — buffers it.
  fastify.get("/party/:code/events", auth, async (request, reply) => {
    const { code } = parse(codeParams, request.params);
    let leave: (() => void) | null = null;
    try {
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      reply.raw.write(": open\n\n");
      leave = await party.connect(code, request.userId!, reply.raw);
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Не получилось подключиться к комнате";
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      reply.raw.end();
      return;
    }
    request.raw.on("close", () => leave?.());
  });

  fastify.post("/party/:code/playback", { ...auth, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    const { code } = parse(codeParams, request.params);
    return party.playback(code, request.userId!, parse(partyPlaybackInputSchema, request.body));
  });

  fastify.post("/party/:code/chat", { ...auth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request) => {
    const { code } = parse(codeParams, request.params);
    return party.chat(code, request.userId!, parse(partyChatInputSchema, request.body));
  });

  fastify.post("/party/:code/invite", { ...auth, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const { code } = parse(codeParams, request.params);
    const { userIds } = parse(z.object({ userIds: z.array(z.string().min(1).max(40)).min(1).max(9) }), request.body);
    return party.invite(code, request.userId!, userIds);
  });

  fastify.post("/party/:code/net", { ...auth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) => {
    const { code } = parse(codeParams, request.params);
    party.net(code, request.userId!, parse(partyNetInputSchema, request.body).mbps);
    return { ok: true };
  });

  fastify.post("/party/:code/react", { ...auth, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    const { code } = parse(codeParams, request.params);
    party.react(code, request.userId!, parse(partyReactionInputSchema, request.body).emoji);
    return { ok: true };
  });
};
