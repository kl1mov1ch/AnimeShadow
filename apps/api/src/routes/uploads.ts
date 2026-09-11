import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { UPLOADS_DIR } from "../services/container.js";
import { parse } from "../lib/validation.js";

const fileParams = z.object({
  file: z.string().regex(/^[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp)$/),
});

/** Minimal static server for user-uploaded avatars (no @fastify/static dep). */
export const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/uploads/avatars/:file", async (request, reply) => {
    const { file } = parse(fileParams, request.params);
    const path = normalize(join(UPLOADS_DIR, "avatars", file));
    if (!path.startsWith(normalize(join(UPLOADS_DIR, "avatars")))) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Bad path" } };
    }
    try {
      await stat(path);
    } catch {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "Not found" } };
    }
    const ext = file.split(".").pop();
    reply
      .header("content-type", ext === "png" ? "image/png" : "image/jpeg")
      .header("cache-control", "public, max-age=86400")
      .header("cross-origin-resource-policy", "cross-origin");
    return reply.send(createReadStream(path));
  });
};
