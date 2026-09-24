import { randomUUID } from "node:crypto";
import { ANIME_WITH_GENRES_INCLUDE, toSummaryDto } from "@animeshadow/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";

/** A round can be answered for this long after it was dealt. */
const ROUND_TTL_MS = 10 * 60_000;
/** Rounds kept in memory at once — old ones are dropped first. */
const MAX_ROUNDS = 5_000;
/** How many of the most-rated titles the game deals from. */
const POOL_SIZE = 400;
/** The pool changes slowly; re-reading it on every round would not. */
const POOL_TTL_MS = 10 * 60_000;

interface Round {
  answerId: number;
  userId: string | null;
  expiresAt: number;
}

interface PoolEntry {
  id: number;
  slug: string;
  title: string;
  titleLocalized: string | null;
  imageUrl: string | null;
  screenshots: string[];
}

const answerBody = z.object({
  roundId: z.string().uuid(),
  optionId: z.number().int().positive(),
});

/**
 * "Guess the anime from a frame", with the answer kept on the server.
 *
 * A round is dealt without saying which option is right; the answer is
 * checked here. That is what lets a leaderboard mean anything — a streak
 * can only grow by answering rounds this server dealt, one at a time, and a
 * signed-in player who asks for a fresh round while one is still open has
 * given that one up, which ends the run the same as a wrong answer would.
 *
 * Rounds live in memory: they are worth ten minutes at most, and a restart
 * costing someone an open round is not worth a table.
 */
export const gameRoutes: FastifyPluginAsync = async (fastify) => {
  const rounds = new Map<string, Round>();
  const openRound = new Map<string, string>();
  const pools = new Map<boolean, { at: number; entries: PoolEntry[] }>();

  const loadPool = async (allowAdult: boolean): Promise<PoolEntry[]> => {
    const cached = pools.get(allowAdult);
    if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached.entries;
    // Well-known titles only — the ones with the most ratings — because a
    // frame from something nobody has seen is a lottery, not a question.
    const entries = await fastify.prisma.anime.findMany({
      where: {
        AND: [
          {
            screenshots: { isEmpty: false },
            score: { gte: 7 },
            scoredBy: { gte: 20_000 },
            imageUrl: { not: null },
          },
          contentGuardWhere(allowAdult),
        ],
      },
      orderBy: { scoredBy: "desc" },
      take: POOL_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        titleLocalized: true,
        imageUrl: true,
        screenshots: true,
      },
    });
    pools.set(allowAdult, { at: Date.now(), entries });
    return entries;
  };

  const sweep = () => {
    const now = Date.now();
    for (const [id, round] of rounds) {
      if (round.expiresAt < now) rounds.delete(id);
    }
    while (rounds.size > MAX_ROUNDS) {
      const oldest = rounds.keys().next().value;
      if (oldest === undefined) break;
      rounds.delete(oldest);
    }
  };

  /** Ends a signed-in player's run. */
  const breakRun = (userId: string) =>
    fastify.prisma.guessScore.upsert({
      where: { userId },
      create: { userId, current: 0 },
      update: { current: 0 },
    });

  fastify.get("/games/guess/round", { preHandler: fastify.optionalAuth }, async (request) => {
    const allowAdult = await resolveAllowAdult(fastify.prisma, request.userId);
    const pool = await loadPool(allowAdult);
    if (pool.length < 4) throw new NotFoundError("Недостаточно тайтлов для игры.");

    // Walking away from an open round is giving it up.
    const userId = request.userId ?? null;
    if (userId) {
      const previous = openRound.get(userId);
      if (previous && rounds.has(previous)) {
        rounds.delete(previous);
        await breakRun(userId);
      }
    }

    const picks = new Set<number>();
    while (picks.size < 4) picks.add(Math.floor(Math.random() * pool.length));
    const options = [...picks].map((i) => pool[i]!);
    const answer = options[Math.floor(Math.random() * options.length)]!;
    const frame = answer.screenshots[Math.floor(Math.random() * answer.screenshots.length)]!;

    sweep();
    const roundId = randomUUID();
    rounds.set(roundId, { answerId: answer.id, userId, expiresAt: Date.now() + ROUND_TTL_MS });
    if (userId) openRound.set(userId, roundId);

    return {
      roundId,
      frame,
      options: options.map(({ screenshots: _shots, ...rest }) => rest),
    };
  });

  fastify.post(
    "/games/guess/answer",
    { preHandler: fastify.optionalAuth },
    async (request) => {
      const { roundId, optionId } = parse(answerBody, request.body);
      const round = rounds.get(roundId);
      if (!round || round.expiresAt < Date.now()) {
        throw new BadRequestError("Раунд устарел — возьмите новый.");
      }
      const userId = request.userId ?? null;
      if (round.userId !== userId) throw new BadRequestError("Это не ваш раунд.");
      rounds.delete(roundId);
      if (userId && openRound.get(userId) === roundId) openRound.delete(userId);

      const correct = optionId === round.answerId;
      let streak: number | null = null;
      let best: number | null = null;

      if (userId) {
        const row = await fastify.prisma.guessScore.findUnique({ where: { userId } });
        const current = correct ? (row?.current ?? 0) + 1 : 0;
        const newBest = Math.max(row?.best ?? 0, current);
        const saved = await fastify.prisma.guessScore.upsert({
          where: { userId },
          create: {
            userId,
            current,
            best: newBest,
            played: 1,
            bestAt: newBest > 0 ? new Date() : null,
          },
          update: {
            current,
            best: newBest,
            played: { increment: 1 },
            ...(newBest > (row?.best ?? 0) ? { bestAt: new Date() } : {}),
          },
        });
        streak = saved.current;
        best = saved.best;
      }

      return { correct, answerId: round.answerId, streak, best };
    },
  );

  fastify.get("/games/guess/leaderboard", { preHandler: fastify.optionalAuth }, async (request) => {
    const top = await fastify.prisma.guessScore.findMany({
      where: { best: { gt: 0 } },
      orderBy: [{ best: "desc" }, { bestAt: "asc" }],
      take: 10,
      select: {
        best: true,
        user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      },
    });
    const me = request.userId
      ? await fastify.prisma.guessScore.findUnique({
          where: { userId: request.userId },
          select: { best: true, current: true, played: true },
        })
      : null;
    let myRank: number | null = null;
    if (me && me.best > 0) {
      myRank = (await fastify.prisma.guessScore.count({ where: { best: { gt: me.best } } })) + 1;
    }
    return {
      top: top.map((row, i) => ({
        rank: i + 1,
        best: row.best,
        userId: row.user.id,
        displayName: row.user.displayName,
        username: row.user.username,
        avatarUrl: row.user.avatarUrl,
      })),
      me: me ? { ...me, rank: myRank } : null,
    };
  });

  /**
   * One title for today, the same for every visitor until midnight UTC,
   * with the reasons it was chosen and what this site knows about it.
   *
   * The pick prefers a title that premiered on this day of the year — a
   * reason a visitor can actually check — and otherwise walks a pool of
   * well-rated, well-known titles by the date, so it changes daily and
   * never repeats within the pool's length.
   */
  let dayPick: { day: number; payload: unknown } | null = null;
  fastify.get("/games/anime-of-the-day", async () => {
    const now = new Date();
    const day = Math.floor(now.getTime() / 86_400_000);
    if (dayPick?.day === day) return dayPick.payload;

    const pool = await fastify.prisma.anime.findMany({
      where: {
        AND: [
          { score: { gte: 7.5 }, scoredBy: { gte: 10_000 }, imageUrl: { not: null }, synopsis: { not: null } },
          contentGuardWhere(false),
        ],
      },
      orderBy: { id: "asc" },
      select: { id: true, airedFrom: true },
    });
    if (pool.length === 0) throw new NotFoundError("Каталог пуст.");

    const month = now.getUTCMonth();
    const date = now.getUTCDate();
    const anniversaries = pool.filter(
      (a) =>
        a.airedFrom != null &&
        a.airedFrom.getUTCMonth() === month &&
        a.airedFrom.getUTCDate() === date &&
        a.airedFrom.getUTCFullYear() < now.getUTCFullYear(),
    );
    const from = anniversaries.length > 0 ? anniversaries : pool;
    const chosenId = from[day % from.length]!.id;

    const [row, inLists, watching, completed, siteScore, comments, betterRated] =
      await Promise.all([
        fastify.prisma.anime.findUniqueOrThrow({
          where: { id: chosenId },
          include: ANIME_WITH_GENRES_INCLUDE,
        }),
        fastify.prisma.libraryEntry.count({ where: { animeId: chosenId } }),
        fastify.prisma.libraryEntry.count({ where: { animeId: chosenId, status: "WATCHING" } }),
        fastify.prisma.libraryEntry.count({ where: { animeId: chosenId, status: "COMPLETED" } }),
        fastify.prisma.libraryEntry.aggregate({
          where: { animeId: chosenId, score: { not: null } },
          _avg: { score: true },
          _count: { score: true },
        }),
        fastify.prisma.comment.count({ where: { animeId: chosenId, deletedAt: null } }),
        fastify.prisma.anime.count({ where: { score: { gt: 0 } } }).then(async (all) => {
          const self = await fastify.prisma.anime.findUnique({ where: { id: chosenId }, select: { score: true } });
          return self?.score != null
            ? fastify.prisma.anime.count({ where: { score: { gt: self.score } } }).then((n) => ({ n, all }))
            : { n: null, all };
        }),
      ]);

    const anime = toSummaryDto(row);
    const years =
      row.airedFrom &&
      row.airedFrom.getUTCMonth() === month &&
      row.airedFrom.getUTCDate() === date
        ? now.getUTCFullYear() - row.airedFrom.getUTCFullYear()
        : null;
    const topPercent =
      betterRated.n != null && betterRated.all > 0
        ? Math.max(1, Math.ceil(((betterRated.n + 1) / betterRated.all) * 100))
        : null;

    const reasons: Array<{ code: string; value?: number }> = [];
    if (years != null && years > 0) reasons.push({ code: "anniversary", value: years });
    if (topPercent != null && topPercent <= 10) reasons.push({ code: "topRated", value: topPercent });
    if ((row.scoredBy ?? 0) >= 500_000) reasons.push({ code: "beloved", value: row.scoredBy ?? 0 });
    if (row.airing === "AIRING") reasons.push({ code: "airing" });
    if (inLists >= 3) reasons.push({ code: "ourUsers", value: inLists });
    if (reasons.length === 0) reasons.push({ code: "pick" });

    const payload = {
      anime,
      stats: {
        score: row.score,
        scoredBy: row.scoredBy,
        members: row.members,
        rank: row.rank,
        topPercent,
        views: row.viewCount,
        inLists,
        watching,
        completed,
        siteScore: siteScore._avg.score,
        siteVotes: siteScore._count.score,
        comments,
      },
      reasons,
    };
    dayPick = { day, payload };
    return payload;
  });
};
