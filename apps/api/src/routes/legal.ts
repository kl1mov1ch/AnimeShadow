import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LEGAL_OPERATOR_DEFAULT, type LegalOperator, legalOperatorSchema } from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

const FILE = join(process.cwd(), "data", "legal.json");

/**
 * The operator's details for the legal documents: read by everyone (the
 * /legal page, consent modals), changed by the admin from that page. Kept in
 * data/legal.json beside the push keys — outside git, so a deploy keeps it.
 */
export const legalRoutes: FastifyPluginAsync = async (fastify) => {
  let current: LegalOperator & { updatedAt: string | null } = { ...LEGAL_OPERATOR_DEFAULT, updatedAt: null };
  try {
    const saved = JSON.parse(await readFile(FILE, "utf8")) as Partial<LegalOperator> & { updatedAt?: string };
    const ok = legalOperatorSchema.safeParse({ ...LEGAL_OPERATOR_DEFAULT, ...saved });
    if (ok.success) current = { ...ok.data, updatedAt: saved.updatedAt ?? null };
  } catch {
    // Nothing saved yet: the defaults.
  }

  fastify.get("/legal", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return current;
  });

  fastify.put("/admin/legal", { preHandler: [fastify.authenticate, fastify.requireAdmin] }, async (request) => {
    const next = { ...parse(legalOperatorSchema, request.body), updatedAt: new Date().toISOString() };
    await mkdir(dirname(FILE), { recursive: true });
    // Written whole, then swapped in: a crash mid-write never leaves half a file.
    await writeFile(`${FILE}.tmp`, JSON.stringify(next, null, 2));
    await rename(`${FILE}.tmp`, FILE);
    current = next;
    request.log.info({ admin: request.userId }, "legal details updated");
    return current;
  });
};
