import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "../apps/api/node_modules/fastify/fastify.js";
import { dailyChallengeRoutes } from "../apps/api/src/routes/daily-challenge.ts";
import { openingGameRoutes } from "../apps/api/src/routes/opening-game.ts";
import { leaderboardRoutes } from "../apps/api/src/routes/leaderboards.ts";
import {
  dailyShuffle,
  moscowDay,
  nextDailyReset,
  playerQueue,
} from "../apps/api/src/lib/arcade.ts";

test("daily reset uses Moscow midnight, including year rollover; shuffle is stable and lossless", () => {
  assert.equal(moscowDay(new Date("2026-12-31T20:59:59Z")), "2026-12-31");
  assert.equal(moscowDay(new Date("2026-12-31T21:00:00Z")), "2027-01-01");
  assert.equal(nextDailyReset("2026-12-31"), "2026-12-31T21:00:00.000Z");
  const pool = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual(dailyShuffle(pool, "today"), dailyShuffle(pool, "today"));
  assert.notDeepEqual(dailyShuffle(pool, "today"), dailyShuffle(pool, "tomorrow"));
  assert.deepEqual(
    [...dailyShuffle(pool, "today")].sort((a, b) => a - b),
    pool,
  );
});

test("score writes queue per player and recover after a rejected write", async () => {
  const queue = playerQueue();
  const results: number[] = [];
  await Promise.allSettled([
    queue("a", async () => {
      results.push(1);
      throw Error("test");
    }),
    queue("a", async () => {
      results.push(2);
    }),
  ]);
  assert.deepEqual(results, [1, 2]);
});

test("daily questions are shared, answers stay hidden, concurrent replays count once and completed attempts cannot restart", async () => {
  const app = Fastify();
  let actor = "a";
  app.decorate("authenticate", async (req: { userId: string }) => {
    req.userId = actor;
  });
  const attempts = new Map<
    string,
    {
      day: string;
      userId: string;
      score: number;
      answered: number;
      finishedAt: Date | null;
    }
  >();
  let questions: unknown[] | null = null;
  app.decorate("prisma", {
    anime: {
      findMany: async () =>
        Array.from({ length: 15 }, (_, i) => ({
          id: i + 1,
          slug: `title-${i}`,
          title: `Title ${i}`,
          titleLocalized: null,
          gameFrames: [`/frame-${i}.jpg`],
          screenshots: [],
        })),
    },
    dailyChallenge: {
      findUnique: async () => (questions ? { questions } : null),
      upsert: async (arg: { create: { questions: unknown[] } }) => {
        questions ??= arg.create.questions;
        return { questions };
      },
    },
    dailyAttempt: {
      findUnique: async ({ where }: { where: { day_userId: { userId: string } } }) =>
        attempts.get(where.day_userId.userId) ?? null,
      upsert: async ({ create }: { create: { day: string; userId: string } }) => {
        if (!attempts.has(create.userId))
          attempts.set(create.userId, {
            ...create,
            score: 0,
            answered: 0,
            finishedAt: null,
          });
        return attempts.get(create.userId);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; answered: number };
        data: { score: { increment: number }; finishedAt?: Date };
      }) => {
        const a = attempts.get(where.userId);
        if (!a || a.finishedAt || a.answered !== where.answered) return { count: 0 };
        a.score += data.score.increment;
        a.answered++;
        a.finishedAt = data.finishedAt ?? null;
        return { count: 1 };
      },
      findMany: async () => [],
    },
  });
  await app.register(dailyChallengeRoutes);
  try {
    assert.equal((await app.inject({ url: "/games/daily" })).json().attempt, null);
    const first = (
      await app.inject({ method: "POST", url: "/games/daily/start" })
    ).json();
    assert.equal(first.question.options.length, 4);
    assert.equal(first.question.answerId, undefined);
    assert.equal(JSON.stringify(first).includes('"answerId"'), false);
    actor = "b";
    const second = (
      await app.inject({ method: "POST", url: "/games/daily/start" })
    ).json();
    assert.deepEqual(first.question, second.question);
    actor = "a";
    const currentDay = moscowDay();
    const q = questions as unknown as Array<{ answerId: number }>;
    const body = { day: currentDay, index: 0, optionId: q[0]!.answerId };
    const results = await Promise.all([
      app.inject({ method: "POST", url: "/games/daily/answer", payload: body }),
      app.inject({ method: "POST", url: "/games/daily/answer", payload: body }),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 400]);
    assert.equal(attempts.get("a")!.score, 1);
    const resumed = (
      await app.inject({ method: "POST", url: "/games/daily/start" })
    ).json();
    assert.equal(resumed.question.index, 1);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/games/daily/answer",
          payload: { day: "2000-01-01", index: 1, optionId: q[1]!.answerId },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/games/daily/answer",
          payload: { day: currentDay, index: 1, optionId: 99999 },
        })
      ).statusCode,
      400,
    );
    for (let i = 1; i < 10; i++)
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/games/daily/answer",
            payload: { day: currentDay, index: i, optionId: q[i]!.answerId },
          })
        ).statusCode,
        200,
      );
    const done = (
      await app.inject({ method: "POST", url: "/games/daily/start" })
    ).json();
    assert.equal(done.attempt.score, 10);
    assert.equal(done.attempt.finished, true);
    assert.equal(done.question, null);
    assert.equal(attempts.get("b")!.answered, 0);
  } finally {
    await app.close();
  }
});

test("opening rounds hide source filenames, resume on duplicate reads, reject other players and record once", async (t) => {
  // Patch the actual package instance the route imports, not the source module copy.
  const { AnimeThemesClient: Client } =
    await import("../apps/api/node_modules/@animeshadow/animethemes/dist/index.js");
  t.mock.method(Client.prototype, "getThemes", async () => ({
    tracks: [
      {
        kind: "OP",
        url: "https://v.animethemes.moe/SecretAnime-OP1.webm",
        audioUrl: null,
      },
    ],
    opening: null,
  }));
  const app = Fastify();
  let actor = "a";
  let played = 0;
  app.decorate("authenticate", async (req: { userId: string }) => {
    req.userId = actor;
  });
  app.decorate("optionalAuth", async (req: { userId: string }) => {
    req.userId = actor;
  });
  app.decorate("prisma", {
    anime: {
      findMany: async () =>
        Array.from({ length: 5 }, (_, i) => ({
          id: i + 1,
          slug: `title-${i}`,
          title: `Title ${i}`,
          titleLocalized: null,
          imageUrl: null,
        })),
    },
    openingScore: {
      findUnique: async () => ({ current: 0, best: 0, played }),
      upsert: async ({ create }: { create: { current: number; best: number } }) => {
        played++;
        return create;
      },
    },
  });
  await app.register(openingGameRoutes);
  try {
    const first = (await app.inject({ url: "/games/opening/round" })).json();
    assert.match(first.frame, /^\/api\/games\/opening\/media\/[a-f0-9-]+$/);
    assert.equal(JSON.stringify(first).includes("SecretAnime"), false);
    assert.equal(
      (await app.inject({ url: "/games/opening/round" })).json().roundId,
      first.roundId,
    );
    actor = "b";
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/games/opening/answer",
          payload: { roundId: first.roundId, optionId: first.options[0].id },
        })
      ).statusCode,
      400,
    );
    actor = "a";
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/games/opening/answer",
          payload: { roundId: first.roundId, optionId: 9999 },
        })
      ).statusCode,
      400,
    );
    const body = { roundId: first.roundId, optionId: first.options[0].id };
    const results = await Promise.all([
      app.inject({ method: "POST", url: "/games/opening/answer", payload: body }),
      app.inject({ method: "POST", url: "/games/opening/answer", payload: body }),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 400]);
    assert.equal(played, 1);
    assert.equal(
      (
        await app.inject({
          url: "/games/opening/media/00000000-0000-4000-8000-000000000000",
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          url: first.frame.replace(/^\/api/, ""),
          headers: { range: "bytes=0-10,20-30" },
        })
      ).statusCode,
      416,
    );
  } finally {
    await app.close();
    t.mock.restoreAll();
  }
});

test("watch leaderboard caches aggregates, converts bigint, isolates personal rows, validates periods and filters privacy in SQL", async () => {
  const app = Fastify();
  let actor = "a";
  let queries = 0;
  app.decorate("optionalAuth", async (req: { userId: string }) => {
    req.userId = actor;
  });
  app.decorate("prisma", {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      queries++;
      const sql = parts.join("?");
      assert.match(sql, /profilePrivacy/);
      assert.match(sql, /stats/);
      assert.match(sql, /isBanned/);
      assert.ok(values[0] instanceof Date);
      return [
        {
          userId: "a",
          displayName: "A",
          username: null,
          avatarUrl: null,
          seconds: 7200n,
          titles: 2n,
          rank: 1n,
        },
        {
          userId: "b",
          displayName: "B",
          username: null,
          avatarUrl: null,
          seconds: 3600n,
          titles: 1n,
          rank: 2n,
        },
      ];
    },
  });
  await app.register(leaderboardRoutes);
  try {
    const first = (await app.inject({ url: "/leaderboards/watch?period=week" })).json();
    assert.equal(first.me.userId, "a");
    assert.equal(first.top[0].seconds, 7200);
    actor = "b";
    assert.equal(
      (await app.inject({ url: "/leaderboards/watch?period=week" })).json().me.userId,
      "b",
    );
    assert.equal(queries, 1);
    assert.equal(
      (await app.inject({ url: "/leaderboards/watch?period=garbage" })).statusCode,
      422,
    );
    await app.inject({ url: "/leaderboards/watch?period=all" });
    assert.equal(queries, 2);
  } finally {
    await app.close();
  }
});
