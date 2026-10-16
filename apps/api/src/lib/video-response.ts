import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { FastifyReply, FastifyRequest } from "fastify";
import { UpstreamUnavailableError } from "./errors.js";

export function boundedVideoRange(value: string | undefined): string | null {
  if (value == null) return null;
  const parts = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(value);
  if (!parts || (!parts[1] && !parts[2])) throw new Error("Invalid byte range");
  const chunk = 2 * 1024 * 1024;
  if (!parts[1]) return `bytes=-${Math.min(Number(parts[2]), chunk)}`;
  const start = Number(parts[1]);
  const end = parts[2] ? Number(parts[2]) : start + chunk - 1;
  if (end < start) throw new Error("Invalid byte range");
  return `bytes=${start}-${Math.min(end, start + chunk - 1)}`;
}

/** Stream one verified CDN file, preserving seeking without saving video to disk. */
export async function sendAnimeVostVideo(request: FastifyRequest, reply: FastifyReply, url: string) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.hostname !== "video.animetop.info" || target.port || target.username || target.password || !/^\/\d+\.mp4$/.test(target.pathname)) {
    throw new UpstreamUnavailableError("Источник видео недоступен.");
  }
  let range: string | null;
  try { range = boundedVideoRange(request.headers.range); }
  catch { return reply.code(416).send(); }
  const controller = new AbortController();
  reply.raw.once("close", () => { if (!reply.raw.writableFinished) controller.abort(); });
  let response: Response;
  try {
    response = await fetch(target, { method: request.method === "HEAD" ? "HEAD" : "GET", redirect: "error",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]), headers: range ? { Range: range } : {} });
  } catch { throw new UpstreamUnavailableError("Источник видео временно не отвечает."); }
  if (response.status === 416) {
    void response.body?.cancel();
    if (response.headers.has("content-range")) reply.header("content-range", response.headers.get("content-range")!);
    return reply.code(416).send();
  }
  if (![200, 206].includes(response.status) || !response.headers.get("content-type")?.startsWith("video/")) {
    void response.body?.cancel();
    throw new UpstreamUnavailableError("Источник не отдал видеофайл.");
  }
  reply.code(response.status).type("video/mp4").header("accept-ranges", "bytes").header("cache-control", "private, max-age=300");
  for (const header of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = response.headers.get(header);
    if (value) reply.header(header, value);
  }
  if (request.method === "HEAD" || !response.body) { void response.body?.cancel(); return reply.send(); }
  return reply.send(Readable.fromWeb(response.body as unknown as ReadableStream));
}
