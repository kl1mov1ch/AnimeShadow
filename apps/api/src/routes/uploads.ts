import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { UPLOADS_DIR } from "../services/container.js";
import { IMAGE_CONTENT_TYPE, type ImageExt } from "../lib/user-images.js";
import { parse } from "../lib/validation.js";

const fileParams = z.object({
  kind: z.enum(["avatars", "banners"]),
  file: z.string().regex(/^[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp|gif)$/),
});

/** Minimal static server for user-uploaded avatars and profile backgrounds (no @fastify/static dep). */
export const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/uploads/:kind/:file", async (request, reply) => {
    const { kind, file } = parse(fileParams, request.params);
    const dir = normalize(join(UPLOADS_DIR, kind));
    const path = normalize(join(dir, file));
    if (!path.startsWith(dir)) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Bad path" } };
    }
    try {
      await stat(path);
    } catch {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "Not found" } };
    }
    const raw = file.split(".").pop() ?? "jpg";
    const ext = (raw === "jpeg" ? "jpg" : raw) as ImageExt;
    // Every save gets a new file name, so a name never changes content —
    // except the old fixed-name avatars, which carry a ?v= of their own.
    reply
      .header("content-type", IMAGE_CONTENT_TYPE[ext] ?? "application/octet-stream")
      .header("cache-control", "public, max-age=2592000")
      .header("x-content-type-options", "nosniff")
      .header("cross-origin-resource-policy", "cross-origin");
    return reply.send(createReadStream(path));
  });
};
