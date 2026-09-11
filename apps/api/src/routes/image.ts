import { Readable } from "node:stream";
import type { FastifyPluginAsync } from "fastify";

// Shikimori (and a few others) block hot-linking by Referer. This proxies the
// image server-side (no Referer), with a long cache, so the browser can show it.
const ALLOWED_HOSTS = [
  "shikimori.io",
  "shikimori.one",
  "shikimori.org",
  "shikimori.me",
  "nyaa.shikimori.one",
  "desu.shikimori.one",
  "moe.shikimori.one",
  "st.kp.yandex.net",
  "avatars.mds.yandex.net",
  "kinopoiskapiunofficial.tech",
  "cdn.myanimelist.net",
];

export const imageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/img", async (request, reply) => {
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

    if (
      target.protocol !== "https:" ||
      !ALLOWED_HOSTS.some(
        (host) => target.hostname === host || target.hostname.endsWith(`.${host}`),
      )
    ) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Host not allowed" } };
    }

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        redirect: "follow",
        headers: { "user-agent": "AnimeShadow/1.0 (image proxy)" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      reply.code(502);
      return { error: { code: "UPSTREAM_UNAVAILABLE", message: "Image fetch failed" } };
    }

    if (!upstream.ok || !upstream.body) {
      reply.code(upstream.status === 404 ? 404 : 502);
      return { error: { code: "NOT_FOUND", message: "Image not found" } };
    }

    reply
      .header(
        "content-type",
        upstream.headers.get("content-type") ?? "image/jpeg",
      )
      .header("cache-control", "public, max-age=604800, immutable")
      .header("cross-origin-resource-policy", "cross-origin")
      // Lets the web app read pixels off these (canvas colour extraction).
      .header("access-control-allow-origin", "*");

    return reply.send(Readable.fromWeb(upstream.body as never));
  });
};
