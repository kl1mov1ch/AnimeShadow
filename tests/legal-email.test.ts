import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import Fastify from "../apps/api/node_modules/fastify/fastify.js";
import { LEGAL_OPERATOR_DEFAULT } from "../packages/shared/src/legal.ts";
import { createLegalRoutes } from "../apps/api/src/routes/legal.ts";

test("contact email changes require an admin, preserve other details and survive restart", async () => {
  const testRoot = resolve("tmp");
  const folder = await mkdtemp(join(testRoot, "legal-email-"));
  const file = join(folder, "legal.json");
  const original = {
    ...LEGAL_OPERATOR_DEFAULT,
    name: "Example operator",
    email: "old@example.com",
    address: "Existing address",
  };
  await writeFile(file, JSON.stringify(original));
  const build = async () => {
    const app = Fastify();
    app.decorate("authenticate", async (request, reply) => {
      if (!request.headers.authorization) return reply.code(401).send();
    });
    app.decorate("requireAdmin", async (request, reply) => {
      if (request.headers.authorization !== "admin-test") return reply.code(403).send();
    });
    await app.register(createLegalRoutes(file));
    await app.ready();
    return app;
  };
  let app = await build();
  try {
    const change = (body: unknown, authorization?: string) =>
      app.inject({
        method: "PATCH",
        url: "/admin/legal/email",
        payload: body as object,
        headers: authorization ? { authorization } : {},
      });
    assert.equal((await change({ email: "new@example.com" })).statusCode, 401);
    assert.equal(
      (await change({ email: "new@example.com" }, "member-test")).statusCode,
      403,
    );
    assert.equal((await change({ email: "invalid" }, "admin-test")).statusCode, 422);
    assert.equal(
      (await change({ email: "new@example.com", name: "Overwrite" }, "admin-test"))
        .statusCode,
      422,
    );
    assert.equal(JSON.parse(await readFile(file, "utf8")).email, original.email);
    const saved = await change({ email: "  new@example.com  " }, "admin-test");
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().email, "new@example.com");
    assert.equal(saved.json().name, original.name);
    assert.equal(saved.json().address, original.address);
    await Promise.all([
      change({ email: "first@example.com" }, "admin-test"),
      change({ email: "second@example.com" }, "admin-test"),
    ]);
    const stored = JSON.parse(await readFile(file, "utf8"));
    const live = await app.inject({ method: "GET", url: "/legal" });
    assert.equal(live.headers["cache-control"], "no-store");
    assert.equal(live.json().email, stored.email);
    assert.equal(stored.address, original.address);
    await app.close();
    app = await build();
    const restored = await app.inject({ method: "GET", url: "/legal" });
    assert.equal(restored.json().email, stored.email);
  } finally {
    await app.close();
    assert.equal(dirname(resolve(folder)), testRoot);
    assert.ok(basename(folder).startsWith("legal-email-"));
    await rm(folder, { recursive: true, force: true });
  }
});
