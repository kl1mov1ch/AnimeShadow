import { Readable } from "node:stream";
import type { FastifyPluginAsync } from "fastify";

// AnimeThemes serves its audio without an Access-Control-Allow-Origin header.
// A plain <audio src> plays it regardless — media loads no-cors — but routing
// that element through Web Audio taints the stream: the analyser reads
// silence, and in most browsers the sound itself stops. Proxying it here adds
// the header, which is what lets the page draw bars that follow the actual
// music rather than bars that merely animate while something plays.
//
// Range requests are forwarded verbatim in both directions. Without that,
// seeking dies: the browser asks for a byte range, gets the whole file back
// with a 200, and gives up on scrubbing entirely.
const ALLOWED_HOSTS = ["a.animethemes.moe", "v.animethemes.moe"];

const USER_AGENT = "AnimeShadow (https://fiat-legacy.xyz)";

export const audioRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/audio", async (request, reply) => {
    const raw = (request.query as { u?: string }).u;
    if (!raw) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Missing ?u" } };
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Bad url" } };
    }

    if (target.protocol !== "https:" || !ALLOWED_HOSTS.includes(target.hostname)) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Host not allowed" } };
    }

    const range = request.headers.range;
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        headers: {
          "user-agent": USER_AGENT,
          ...(range ? { range } : {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      reply.code(502);
      return { error: { code: "UPSTREAM_UNAVAILABLE", message: "Audio fetch failed" } };
    }

    if (!upstream.ok || !upstream.body) {
      reply.code(upstream.status === 404 ? 404 : 502);
      return { error: { code: "NOT_FOUND", message: "Audio not found" } };
    }

    // 206 and its Content-Range have to survive the hop, or the browser
    // cannot seek.
    reply.code(upstream.status);
    // `accept-ranges` is deliberately not forwarded: Fastify sets it itself,
    // and forwarding it too produced a doubled "bytes, bytes" value.
    for (const header of ["content-type", "content-length", "content-range"]) {
      const value = upstream.headers.get(header);
      if (value) reply.header(header, value);
    }
    reply
      .header("cache-control", "public, max-age=604800")
      .header("access-control-allow-origin", "*")
      .header("cross-origin-resource-policy", "cross-origin");

    return reply.send(Readable.fromWeb(upstream.body as never));
  });
};
