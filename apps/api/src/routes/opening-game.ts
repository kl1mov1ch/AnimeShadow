import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { FastifyPluginAsync } from "fastify";
import { AnimeThemesClient } from "@animeshadow/animethemes";
import { z } from "zod";
import { contentGuardWhere } from "../lib/content-guard.js";
import {
  BadRequestError,
  NotFoundError,
  UpstreamUnavailableError,
} from "../lib/errors.js";
import { parse } from "../lib/validation.js";
import { TtlCache } from "../lib/cache.js";
import { playerQueue } from "../lib/arcade.js";

interface Option {
  id: number;
  slug: string;
  title: string;
  titleLocalized: string | null;
  imageUrl: string | null;
}
interface OpeningRound {
  userId: string;
  answerId: number;
  source: string;
  expiresAt: number;
  options: Option[];
  answered: boolean;
}

export const openingGameRoutes: FastifyPluginAsync = async (app) => {
  const themes = new AnimeThemesClient({ timeoutMs: 8000 });
  const tracks = new TtlCache<string | null>(3_600_000, 256);
  const poolCache = new TtlCache<Option[]>(600_000, 1);
  const rounds = new Map<string, OpeningRound>();
  const active = new Map<string, string>();
  const queue = playerQueue();
  const pool = () =>
    poolCache.wrap("pool", () =>
      app.prisma.anime.findMany({
        where: {
          AND: [
            contentGuardWhere(false),
            { score: { gte: 6 }, scoredBy: { gte: 3000 } },
          ],
        },
        orderBy: [{ scoredBy: "desc" }, { id: "asc" }],
        take: 150,
        select: {
          id: true,
          slug: true,
          title: true,
          titleLocalized: true,
          imageUrl: true,
        },
      }),
    );
  const trackFor = (id: number) =>
    tracks.wrap(String(id), async () => {
      const result = await themes.getThemes(id);
      if (result.error === "HTTP 404 (application/json)") return null;
      if (result.error)
        throw new UpstreamUnavailableError(
          "Архив опенингов временно недоступен. Попробуйте ещё раз.",
        );
      const opening = result.tracks.find((t) => t.kind === "OP");
      const source = opening?.audioUrl ?? opening?.url;
      if (!source) return null;
      try {
        const url = new URL(source);
        return url.protocol === "https:" &&
          ["a.animethemes.moe", "v.animethemes.moe"].includes(url.hostname)
          ? source
          : null;
      } catch {
        return null;
      }
    });
  const dto = (id: string, r: OpeningRound) => ({
    roundId: id,
    frame: `/api/games/opening/media/${id}`,
    options: r.options,
  });
  const deal = async (userId: string) => {
    const now = Date.now();
    for (const [id, r] of rounds)
      if (r.expiresAt <= now) {
        rounds.delete(id);
        if (active.get(r.userId) === id) active.delete(r.userId);
      }
    const rows = await pool();
    if (rows.length < 4) throw new NotFoundError("Пока недостаточно аниме для игры.");
    const candidates = [...rows].sort(() => Math.random() - 0.5);
    let answer: Option | undefined;
    let source: string | null = null;
    let upstreamFailed = false;
    for (const candidate of candidates.slice(0, 3)) {
      try {
        source = await trackFor(candidate.id);
        if (source) {
          answer = candidate;
          break;
        }
      } catch {
        upstreamFailed = true;
      }
    }
    if ((!answer || !source) && upstreamFailed)
      throw new UpstreamUnavailableError(
        "Архив опенингов временно недоступен. Попробуйте ещё раз.",
      );
    if (!answer || !source)
      throw new NotFoundError("Не удалось подобрать опенинг. Попробуйте ещё раз.");
    const options = [
      answer,
      ...candidates.filter((r) => r.id !== answer!.id).slice(0, 3),
    ].sort(() => Math.random() - 0.5);
    while (rounds.size >= 5000) rounds.delete(rounds.keys().next().value!);
    const id = randomUUID();
    const round = {
      userId,
      answerId: answer.id,
      source,
      expiresAt: now + 600_000,
      options,
      answered: false,
    };
    rounds.set(id, round);
    active.set(userId, id);
    return dto(id, round);
  };

  app.get("/games/opening/round", { preHandler: app.authenticate }, (req) =>
    queue(req.userId!, async () => {
      const id = active.get(req.userId!);
      const r = id ? rounds.get(id) : undefined;
      // Reloading/duplicate requests resume the same question.
      return r && !r.answered && r.expiresAt > Date.now()
        ? dto(id!, r)
        : deal(req.userId!);
    }),
  );
  app.post("/games/opening/answer", { preHandler: app.authenticate }, (req) =>
    queue(req.userId!, async () => {
      const { roundId, optionId } = parse(
        z.object({ roundId: z.string().uuid(), optionId: z.number().int().positive() }),
        req.body,
      );
      const r = rounds.get(roundId);
      if (!r || r.userId !== req.userId || r.answered || r.expiresAt <= Date.now())
        throw new BadRequestError("Раунд устарел. Начните новый.");
      if (!r.options.some((o) => o.id === optionId))
        throw new BadRequestError("Выберите один из предложенных ответов.");
      const correct = optionId === r.answerId;
      const row = await app.prisma.openingScore.findUnique({
        where: { userId: req.userId! },
      });
      const current = correct ? (row?.current ?? 0) + 1 : 0;
      const best = Math.max(row?.best ?? 0, current);
      const saved = await app.prisma.openingScore.upsert({
        where: { userId: req.userId! },
        create: {
          userId: req.userId!,
          current,
          best,
          played: 1,
          bestAt: best ? new Date() : null,
        },
        update: {
          current,
          best,
          played: { increment: 1 },
          ...(best > (row?.best ?? 0) ? { bestAt: new Date() } : {}),
        },
      });
      r.answered = true;
      return { correct, answerId: r.answerId, streak: saved.current, best: saved.best };
    }),
  );
  app.post(
    "/games/opening/replace",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    (req) =>
      queue(req.userId!, async () => {
        const { roundId } = parse(z.object({ roundId: z.string().uuid() }), req.body);
        const r = rounds.get(roundId);
        if (!r || r.userId !== req.userId || r.answered || r.expiresAt <= Date.now())
          throw new BadRequestError("Раунд устарел.");
        const next = await deal(req.userId!);
        rounds.delete(roundId);
        return next;
      }),
  );
  app.get(
    "/games/opening/leaderboard",
    { preHandler: app.optionalAuth },
    async (req) => {
      const top = await app.prisma.openingScore.findMany({
        where: { best: { gt: 0 }, user: { isBanned: false } },
        orderBy: [{ best: "desc" }, { bestAt: "asc" }, { userId: "asc" }],
        take: 50,
        select: {
          best: true,
          user: {
            select: { id: true, displayName: true, username: true, avatarUrl: true },
          },
        },
      });
      const me = req.userId
        ? await app.prisma.openingScore.findUnique({
            where: { userId: req.userId },
            select: { best: true, current: true, played: true },
          })
        : null;
      const rank = me?.best
        ? 1 +
          (await app.prisma.openingScore.count({
            where: { best: { gt: me.best }, user: { isBanned: false } },
          }))
        : null;
      let place = 0;
      return {
        top: top.map((r, i) => {
          if (i === 0 || top[i - 1]!.best !== r.best) place = i + 1;
          return {
            rank: place,
            best: r.best,
            userId: r.user.id,
            displayName: r.user.displayName,
            username: r.user.username,
            avatarUrl: r.user.avatarUrl,
          };
        }),
        me: me ? { ...me, rank } : null,
      };
    },
  );

  // Opaque, short-lived media URLs conceal filenames containing the correct title.
  // Range streaming avoids downloading a whole theme into server memory.
  app.get("/games/opening/media/:id", async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const r = rounds.get(id);
    if (!r || r.expiresAt <= Date.now()) throw new NotFoundError("Опенинг устарел.");
    const range = req.headers.range;
    if (range && !/^bytes=\d*-\d*$/.test(range)) return reply.code(416).send();
    const abort = new AbortController();
    reply.raw.once("close", () => abort.abort());
    const response = await fetch(r.source, {
      redirect: "error",
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]),
      headers: range ? { range } : {},
    }).catch(() => {
      throw new UpstreamUnavailableError(
        "Не удалось загрузить опенинг. Повторите попытку.",
      );
    });
    if (![200, 206].includes(response.status) || !response.body)
      throw new UpstreamUnavailableError("Не удалось загрузить опенинг.");
    reply
      .code(response.status)
      .header("cache-control", "private, no-store")
      .header("content-type", response.headers.get("content-type") ?? "audio/webm");
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = response.headers.get(name);
      if (value) reply.header(name, value);
    }
    return reply.send(Readable.fromWeb(response.body as ReadableStream));
  });
};
