import {
  createPartyInputSchema,
  partyChatInputSchema,
  partyNetInputSchema,
  partyPlaybackInputSchema,
  partyReactionInputSchema,
  partyMuteInputSchema,
  partySettingsInputSchema,
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
    return party.create(request.userId!, input.animeId, input.episode, input.visibility);
  });

  // The list of rooms going on (open ones, and friends' for their friends).
  fastify.get("/party", { preHandler: fastify.optionalAuth }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    return { rooms: await party.list(request.userId) };
  });

  fastify.patch("/party/:code/settings", auth, async (request) => {
    const { code } = parse(codeParams, request.params);
    return party.settings(code, request.userId!, parse(partySettingsInputSchema, request.body));
  });

  fastify.post("/party/:code/mute", auth, async (request) => {
    const { code } = parse(codeParams, request.params);
    const input = parse(partyMuteInputSchema, request.body);
    return party.mute(code, request.userId!, input.userId, input.muted);
  });

  fastify.post("/party/:code/leave", auth, async (request) => party.leave(parse(codeParams, request.params).code, request.userId!));

  // A small download to measure a line the page can't otherwise see (Kodik's player).
  const probe = Buffer.alloc(384 * 1024, 7);
  fastify.get("/party/speedtest", async (_request, reply) => {
    reply.header("cache-control", "no-store").header("content-type", "application/octet-stream").header("content-encoding", "identity");
    return reply.send(probe);
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
