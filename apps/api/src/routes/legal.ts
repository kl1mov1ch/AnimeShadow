import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  LEGAL_OPERATOR_DEFAULT,
  type LegalOperator,
  legalOperatorSchema,
} from "@animeshadow/shared";
import type { FastifyPluginAsync } from "fastify";
import { parse } from "../lib/validation.js";

const FILE = join(process.cwd(), "data", "legal.json");

/**
 * The operator's details for the legal documents: read by everyone (the
 * /legal page, consent modals), changed by the admin from that page. Kept in
 * data/legal.json beside the push keys — outside git, so a deploy keeps it.
 */
export function createLegalRoutes(file = FILE): FastifyPluginAsync {
  return async (fastify) => {
    let current: LegalOperator & { updatedAt: string | null } = {
      ...LEGAL_OPERATOR_DEFAULT,
      updatedAt: null,
    };
    try {
      const saved = JSON.parse(
        await readFile(file, "utf8"),
      ) as Partial<LegalOperator> & { updatedAt?: string };
      const ok = legalOperatorSchema.safeParse({ ...LEGAL_OPERATOR_DEFAULT, ...saved });
      if (ok.success) current = { ...ok.data, updatedAt: saved.updatedAt ?? null };
    } catch {
      // Nothing saved yet: the defaults.
    }

    fastify.get("/legal", async (_request, reply) => {
      reply.header("cache-control", "no-store");
      return current;
    });

    let pending = Promise.resolve();
    const save = (changes: Partial<LegalOperator>) => {
      const operation = pending.then(async () => {
        const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
        await mkdir(dirname(file), { recursive: true });
        // Written whole, then swapped in: a crash mid-write never leaves half a file.
        await writeFile(`${file}.tmp`, JSON.stringify(next, null, 2));
        await rename(`${file}.tmp`, file);
        current = next;
        return current;
      });
      pending = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    };
    const admin = { preHandler: [fastify.authenticate, fastify.requireAdmin] };
    fastify.put("/admin/legal", admin, async (request) => {
      const next = await save(parse(legalOperatorSchema, request.body));
      request.log.info({ admin: request.userId }, "legal details updated");
      return next;
    });
    fastify.patch("/admin/legal/email", admin, async (request) => {
      const next = await save(
        parse(legalOperatorSchema.pick({ email: true }).strict(), request.body),
      );
      request.log.info({ admin: request.userId }, "legal contact email updated");
      return next;
    });
  };
}

export const legalRoutes = createLegalRoutes();
