import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

// Route imports construct the shared Prisma singleton; this suite replaces all
// query methods and never opens a database connection.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/private_routes";
process.env.NODE_ENV = "test";
const { socialRoutes } = await import("../src/routes/social.js");
const { leaderboardRoutes } = await import("../src/routes/leaderboards.js");
const { gameRoutes } = await import("../src/routes/games.js");
const { openingGameRoutes } = await import("../src/routes/opening-game.js");
const { dailyChallengeRoutes } = await import("../src/routes/daily-challenge.js");
const { peopleDirectory } = await import("../src/lib/people-directory.js");
const { UnauthorizedError } = await import("../src/lib/errors.js");

const protectedUrls = [
  "/people/directory",
  "/people/search?q=shadow",
  "/people/popular",
  "/people/suggested",
  "/leaderboards/watch?period=week",
  "/games/guess/leaderboard",
  "/games/opening/leaderboard",
  "/games/daily/leaderboard",
];

async function fixture() {
  const app = Fastify();
  const calls: string[] = [];
  app.decorate("authenticate", async (request) => {
    if (request.headers.authorization !== "Bearer member") throw new UnauthorizedError();
    request.userId = "member";
  });
  app.decorate("optionalAuth", async () => { calls.push("optional-auth"); });
  const score = (name: string) => ({
    findMany: async () => { calls.push(`${name}.findMany`); return []; },
    findUnique: async () => { calls.push(`${name}.findUnique`); return null; },
  });
  app.decorate("prisma", {
    $queryRaw: async () => { calls.push("query"); return []; },
    guessScore: score("guess"),
    openingScore: score("opening"),
    dailyAttempt: score("daily"),
  });
  app.decorate("services", {
    social: {
      searchPeople: async () => { calls.push("search"); return []; },
      popularPeople: async () => { calls.push("popular"); return []; },
      suggestions: async () => { calls.push("suggested"); return []; },
    },
    catalog: {},
  });
  await app.register(socialRoutes);
  await app.register(leaderboardRoutes);
  await app.register(gameRoutes);
  await app.register(openingGameRoutes);
  await app.register(dailyChallengeRoutes);
  return { app, calls };
}

test("all people search and ranking routes reject guests before any service/database call", async () => {
  const { app, calls } = await fixture();
  try {
    for (const authorization of [undefined, "Bearer invalid"]) {
      for (const url of [...protectedUrls, "/people/directory?page=invalid", "/leaderboards/watch?period=invalid"]) {
        const response = await app.inject({ url, headers: authorization ? { authorization } : {} });
        assert.equal(response.statusCode, 401, url);
        assert.deepEqual(calls, [], `${url} must reject before reading private results`);
      }
    }
  } finally {
    await app.close();
  }
});

test("members can load rankings/search, while warm caches remain unavailable to guests", async () => {
  const { app, calls } = await fixture();
  try {
    for (const url of protectedUrls) {
      const response = await app.inject({ url, headers: { authorization: "Bearer member" } });
      assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
      if (url.startsWith("/leaderboards/watch")) {
        assert.equal("participants" in response.json(), false);
        assert.deepEqual(response.json().top, []);
      }
      const previousCalls = [...calls];
      assert.equal((await app.inject({ url })).statusCode, 401, `${url} after member cache fill`);
      assert.deepEqual(calls, previousCalls);
    }
    assert.ok(calls.includes("query"));
    assert.ok(calls.includes("search"));
    assert.ok(calls.includes("guess.findMany"));
    assert.ok(calls.includes("opening.findMany"));
    assert.ok(calls.includes("daily.findMany"));
    assert.equal(calls.includes("optional-auth"), false);
  } finally {
    await app.close();
  }
});

test("short nonempty directory queries skip SQL and identity decoration entirely", async () => {
  const prisma = new Proxy({}, { get() { throw new Error("Short queries must not access Prisma"); } });
  for (const q of ["a", " я ", "@a", "@ a", "@", "@@"]) {
    assert.deepEqual(await peopleDirectory(prisma as never, q, 3, "member"), { items: [], page: 3, hasMore: false });
  }
});

test("directory browse skips wildcard sorting/counts; literal searches page only 21 IDs", async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const prisma = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: parts.join("?"), values });
      return [];
    },
  };
  for (const q of ["", "   ", "ab", "@a%_\\"]) {
    assert.deepEqual(await peopleDirectory(prisma as never, q, 2, "member"), { items: [], page: 2, hasMore: false });
  }
  assert.equal(queries.length, 4);
  for (const query of queries) {
    assert.doesNotMatch(query.sql, /count\s*\(/i);
    assert.match(query.sql, /LIMIT \? OFFSET \?/);
    assert.deepEqual(query.values.slice(-2), [21, 20]);
  }
  assert.doesNotMatch(queries[0]!.sql, /ILIKE/);
  assert.doesNotMatch(queries[1]!.sql, /ILIKE/);
  assert.match(queries[2]!.sql, /ILIKE/);
  assert.ok(queries[3]!.values.includes("%a\\%\\_\\\\%"), "SQL wildcards are searched literally");
});
