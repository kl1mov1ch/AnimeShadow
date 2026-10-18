import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "../apps/api/node_modules/fastify/fastify.js";
import { studioRoutes } from "../apps/api/src/routes/studios.ts";

test("public studio reads share a cache and expose episode identity without provider addresses", async () => {
  const app = Fastify();
  app.decorate("authenticate", async () => undefined);
  app.decorate("requireAdmin", async () => undefined);
  let calls = 0;
  app.decorate("prisma", {
    anime: {
      findMany: async () => {
        calls++;
        return [
          {
            id: 1,
            slug: "1-title",
            title: "Title",
            titleLocalized: null,
            imageUrl: null,
            imageLargeUrl: null,
            bannerImage: null,
            year: 2026,
            episodes: 12,
            airing: "AIRING",
            playerSources: [
              {
                episodesCount: 12,
                iframeEpisodes: {
                  "1": { url: "https://provider.example/private" },
                  "3": { url: "https://provider.example/private3" },
                  "0": {},
                },
                hlsEpisodes: null,
              },
              {
                episodesCount: 3,
                iframeEpisodes: { "1": {}, "3": {} },
                hlsEpisodes: null,
              },
            ],
          },
        ];
      },
    },
  });
  await app.register(studioRoutes, { prefix: "/api" });
  try {
    const [first, second] = await Promise.all([
      app.inject("/api/studios/hon-kon"),
      app.inject("/api/studios/hon-kon"),
    ]);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(calls, 1);
    const [release] = first.json().releases;
    assert.deepEqual(release.episodeNumbers, [1, 3]);
    assert.equal(release.availableEpisodes, 2);
    assert.equal(release.imageLargeUrl, null);
    assert.equal(release.playerSources, undefined);
    assert.ok(!first.body.includes("provider.example"));
    assert.match(first.headers["cache-control"]!, /public/);
  } finally {
    await app.close();
  }
});

test("studio management routes authenticate and require admin before calling services", async () => {
  const app = Fastify();
  const calls: string[] = [];
  app.decorate("authenticate", async (request, reply) => {
    calls.push("authenticate");
    if (!request.headers.authorization)
      return reply.code(401).send({ error: "Unauthorized" });
  });
  app.decorate("requireAdmin", async (request, reply) => {
    calls.push("admin");
    if (request.headers.authorization !== "admin")
      return reply.code(403).send({ error: "Forbidden" });
  });
  app.decorate("prisma", { anime: { findMany: async () => [] } });
  app.decorate("services", {
    honkon: {
      refresh: async () => {
        calls.push("refresh");
      },
      status: () => ({}),
      audit: async () => {
        calls.push("audit");
      },
      auditStatus: () => ({ running: false }),
    },
  });
  await app.register(studioRoutes, { prefix: "/api" });
  try {
    for (const path of ["sync", "audit"]) {
      calls.length = 0;
      assert.equal(
        (await app.inject({ method: "POST", url: `/api/studios/hon-kon/${path}` }))
          .statusCode,
        401,
      );
      assert.deepEqual(calls, ["authenticate"]);
      calls.length = 0;
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/api/studios/hon-kon/${path}`,
            headers: { authorization: "member" },
          })
        ).statusCode,
        403,
      );
      assert.deepEqual(calls, ["authenticate", "admin"]);
    }
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/studios/hon-kon/sync",
          headers: { authorization: "admin" },
        })
      ).statusCode,
      200,
    );
    assert.ok(calls.includes("refresh"));
  } finally {
    await app.close();
  }
});
