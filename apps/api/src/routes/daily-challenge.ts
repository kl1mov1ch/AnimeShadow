import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contentGuardWhere } from "../lib/content-guard.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";
import { dailyShuffle, moscowDay, nextDailyReset } from "../lib/arcade.js";
import { TtlCache } from "../lib/cache.js";

interface Option {
  id: number;
  title: string;
  slug: string;
}
interface Question {
  answerId: number;
  frame: string;
  options: Option[];
}
const answerSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  index: z.number().int().min(0).max(9),
  optionId: z.number().int().positive(),
});

export const dailyChallengeRoutes: FastifyPluginAsync = async (app) => {
  const sets = new TtlCache<Question[]>(86_400_000, 3);
  const questionsFor = (day: string) =>
    sets.wrap(day, async () => {
      const saved = await app.prisma.dailyChallenge.findUnique({ where: { day } });
      if (saved) return saved.questions as unknown as Question[];
      const rows = await app.prisma.anime.findMany({
        where: {
          AND: [
            contentGuardWhere(false),
            {
              score: { gte: 6 },
              scoredBy: { gte: 3000 },
              OR: [
                { gameFrames: { isEmpty: false } },
                { screenshots: { isEmpty: false } },
              ],
            },
          ],
        },
        orderBy: [{ scoredBy: "desc" }, { id: "asc" }],
        take: 600,
        select: {
          id: true,
          slug: true,
          title: true,
          titleLocalized: true,
          gameFrames: true,
          screenshots: true,
        },
      });
      if (rows.length < 10)
        throw new NotFoundError(
          "Для вызова дня пока недостаточно кадров. Попробуйте позже.",
        );
      const pool = dailyShuffle(rows, day);
      const questions: Question[] = pool.slice(0, 10).map((answer, index) => {
        const distractors = dailyShuffle(
          pool.filter((r) => r.id !== answer.id),
          `${day}:${index}`,
        ).slice(0, 3);
        const frames = answer.gameFrames.length
          ? answer.gameFrames
          : answer.screenshots;
        return {
          answerId: answer.id,
          frame: frames[index % frames.length]!.replace(
            "/screenshots/original/",
            "/screenshots/x332/",
          ),
          options: dailyShuffle(
            [answer, ...distractors],
            `${day}:options:${index}`,
          ).map((r) => ({
            id: r.id,
            slug: r.slug,
            title: r.titleLocalized ?? r.title,
          })),
        };
      });
      // Concurrent processes all use the single persisted winner, never overwrite a live day.
      const result = await app.prisma.dailyChallenge.upsert({
        where: { day },
        create: { day, questions: JSON.parse(JSON.stringify(questions)) },
        update: {},
      });
      return result.questions as unknown as Question[];
    });

  const state = async (userId: string, day: string) => {
    const attempt = await app.prisma.dailyAttempt.findUnique({
      where: { day_userId: { day, userId } },
    });
    const questions = attempt ? await questionsFor(day) : null;
    const q = questions?.[attempt?.answered ?? 0];
    return {
      day,
      resetsAt: nextDailyReset(day),
      total: 10,
      attempt: attempt
        ? {
            answered: attempt.answered,
            score: attempt.score,
            finished: Boolean(attempt.finishedAt),
          }
        : null,
      question: q
        ? { index: attempt!.answered, frame: q.frame, options: q.options }
        : null,
    };
  };

  app.get("/games/daily", { preHandler: app.authenticate }, (req) =>
    state(req.userId!, moscowDay()),
  );
  app.post("/games/daily/start", { preHandler: app.authenticate }, async (req) => {
    const day = moscowDay();
    await questionsFor(day);
    await app.prisma.dailyAttempt.upsert({
      where: { day_userId: { day, userId: req.userId! } },
      create: { day, userId: req.userId! },
      update: {},
    });
    return state(req.userId!, day);
  });
  app.post("/games/daily/answer", { preHandler: app.authenticate }, async (req) => {
    const input = parse(answerSchema, req.body);
    if (input.day !== moscowDay())
      throw new BadRequestError("Начался новый день. Откройте новый вызов.");
    const questions = await questionsFor(input.day);
    const question = questions[input.index]!;
    if (!question.options.some((o) => o.id === input.optionId))
      throw new BadRequestError("Выберите один из предложенных ответов.");
    const correct = input.optionId === question.answerId;
    const updated = await app.prisma.dailyAttempt.updateMany({
      where: {
        day: input.day,
        userId: req.userId!,
        answered: input.index,
        finishedAt: null,
      },
      data: {
        answered: { increment: 1 },
        score: { increment: correct ? 1 : 0 },
        ...(input.index === 9 ? { finishedAt: new Date() } : {}),
      },
    });
    if (updated.count !== 1)
      throw new BadRequestError(
        "Этот ответ уже принят. Обновите вызов, чтобы продолжить.",
      );
    if (input.index === 9) boards.delete(input.day);
    return {
      correct,
      answerId: question.answerId,
      state: await state(req.userId!, input.day),
    };
  });
  const boards = new TtlCache<unknown>(15_000, 2);
  app.get("/games/daily/leaderboard", async () => {
    const day = moscowDay();
    return boards.wrap(day, async () => {
      const rows = await app.prisma.dailyAttempt.findMany({
        where: { day, finishedAt: { not: null }, user: { isBanned: false } },
        orderBy: [{ score: "desc" }, { finishedAt: "asc" }, { userId: "asc" }],
        take: 50,
        select: {
          score: true,
          user: {
            select: { id: true, displayName: true, username: true, avatarUrl: true },
          },
        },
      });
      let rank = 0;
      return {
        day,
        resetsAt: nextDailyReset(day),
        top: rows.map((r, i) => {
          if (i === 0 || rows[i - 1]!.score !== r.score) rank = i + 1;
          return {
            rank,
            score: r.score,
            userId: r.user.id,
            displayName: r.user.displayName,
            username: r.user.username,
            avatarUrl: r.user.avatarUrl,
          };
        }),
      };
    });
  });
};
