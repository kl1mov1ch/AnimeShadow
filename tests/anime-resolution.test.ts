import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "../apps/api/node_modules/fastify/fastify.js";
import { animeIdFromReference } from "../packages/shared/src/index.ts";
import { animeRequestIdentity } from "../apps/web/src/lib/anime-request.ts";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/anime_resolution";
const { animeRoutes } = await import("../apps/api/src/routes/anime.ts");

test("canonical and old numeric-prefix links share the direct ID request and cache key", () => {
  const identity = animeRequestIdentity(1535, "ru");
  for (const reference of [
    "1535",
    "1535-death-note",
    "1535-obsolete-name",
    "001535-old-name",
    "1535-старое-название",
  ]) {
    assert.equal(animeIdFromReference(reference), 1535);
    assert.deepEqual(animeRequestIdentity(reference, "ru"), identity);
  }
  assert.equal(identity.path, "/anime/1535");
  assert.notDeepEqual(animeRequestIdentity(1535, "en").queryKey, identity.queryKey);
  assert.deepEqual(animeRequestIdentity("death-note", "ru"), {
    path: "/anime/by-slug/death-note",
    queryKey: ["anime", "death-note", "ru"],
  });
});

test("only complete, bounded ID references take the direct path", () => {
  for (const reference of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    2147483648,
    "0-title",
    "2147483648-title",
    "1535abc",
    "1535-title/episode/3",
    "1535-title?user=1",
    "1535-",
  ]) {
    assert.equal(animeIdFromReference(reference), null, String(reference));
  }
  assert.equal(animeIdFromReference("2147483647-title"), 2147483647);
});

test("API compatibility by-slug route uses ID before any exact-slug lookup", async () => {
  const app = Fastify();
  const calls: number[] = [];
  let slugReads = 0;
  app.decorate("optionalAuth", async () => {});
  app.decorate("authenticate", async () => {});
  app.decorate("prisma", {
    anime: {
      findFirst: async ({ where }: { where: { slug: string } }) => {
        slugReads++;
        return where.slug === "death-note" ? { id: 1535 } : null;
      },
    },
  });
  app.decorate("services", {
    catalog: {
      getAnimeById: async (id: number) => {
        calls.push(id);
        return { id, slug: "1535-death-note" };
      },
    },
    watch: {},
    episodeInfo: {},
  });
  await app.register(animeRoutes);
  try {
    for (const url of [
      "/anime/1535?lang=ru",
      "/anime/by-slug/1535-old-name?lang=ru",
      "/anime/by-slug/1535-death-note?lang=en",
    ]) {
      const response = await app.inject({ url });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().id, 1535);
    }
    assert.equal(slugReads, 0);
    assert.deepEqual(calls, [1535, 1535, 1535]);
    assert.equal(
      (await app.inject({ url: "/anime/by-slug/death-note" })).statusCode,
      200,
    );
    assert.equal(slugReads, 1);
    assert.equal(
      (await app.inject({ url: "/anime/by-slug/genuinely-missing" })).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});
