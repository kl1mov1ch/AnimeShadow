import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import { BadRequestError, NotFoundError, TooManyRequestsError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";

/** A round can be answered for this long after it was dealt. */
const ROUND_TTL_MS = 10 * 60_000;
/** Rounds kept in memory at once — old ones are dropped first. */
const MAX_ROUNDS = 5_000;
/** The deck changes slowly (only as frames are backfilled). */
const DECK_TTL_MS = 30 * 60_000;
/** Which titles are fair game: known enough that a frame is a question,
 *  not a lottery. */
const POOL_WHERE = {
  score: { gte: 6 },
  scoredBy: { gte: 3_000 },
  imageUrl: { not: null },
} as const;
/** Frames kept per title in the deck. */
const FRAMES_PER_TITLE = 8;
/** Places on the leaderboard. */
const BOARD_SIZE = 50;
/** Free "this frame didn't load" replacements per player per hour. */
const REPLACEMENTS_PER_HOUR = 5;
/** Between two Shikimori calls while backfilling frames. */
const BACKFILL_GAP_MS = 1_200;

interface Round {
  answerId: number;
  userId: string;
  expiresAt: number;
  dealtAt: number;
}

interface Title {
  id: number;
  slug: string;
  title: string;
  titleLocalized: string | null;
  imageUrl: string | null;
}

interface Deck {
  at: number;
  titles: Title[];
  byId: Map<number, Title>;
  /** Every frame of every title, in one fixed shuffled order. */
  frames: Array<{ animeId: number; url: string }>;
}

const answerBody = z.object({
  roundId: z.string().uuid(),
  optionId: z.number().int().positive(),
});
const replaceBody = z.object({ roundId: z.string().uuid() });

/** Small, fast, seedable PRNG — the deck order must be the same on every
 *  rebuild, or players' positions would point at different frames. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Position `pos` of a player's own walk through a deck of `size` frames:
 * `(a·pos + b) mod size`, with `a` coprime to `size`, visits every frame
 * exactly once before any repeats — a full shuffle per player without
 * storing one. `seed` picks that player's `a` and `b`.
 */
function deckIndex(seed: number, pos: number, size: number): number {
  let a = (seed % Math.max(1, size - 1)) + 1;
  while (gcd(a, size) !== 1) a++;
  const b = seed % size;
  return (a * (pos % size) + b) % size;
}

/** Shikimori serves a ~590×332 copy of every screenshot, a seventh of the
 *  original's weight — plenty for the game's frame. */
function smallFrame(url: string): string {
  return url.replace("/screenshots/original/", "/screenshots/x332/");
}

/**
 * "Guess the anime from a frame", signed-in players only.
 *
 * The answer never leaves the server until the round is answered, which is
 * what makes the leaderboard mean anything. Frames come from a fixed deck
 * — every frame of every known title, shuffled once — and each player walks
 * it in an order of their own: a frame they've seen comes back only after
 * the whole deck (thousands of frames) has been dealt to them.
 */
export const gameRoutes: FastifyPluginAsync = async (fastify) => {
  const { catalog } = fastify.services;
  const rounds = new Map<string, Round>();
  const openRound = new Map<string, string>();
  const decks = new Map<boolean, Deck>();
  const replacements = new Map<string, number[]>();

  const loadDeck = async (allowAdult: boolean): Promise<Deck> => {
    const cached = decks.get(allowAdult);
    if (cached && Date.now() - cached.at < DECK_TTL_MS) return cached;
    const rows = await fastify.prisma.anime.findMany({
      where: {
        AND: [
          POOL_WHERE,
          { OR: [{ screenshots: { isEmpty: false } }, { gameFrames: { isEmpty: false } }] },
          contentGuardWhere(allowAdult),
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        titleLocalized: true,
        imageUrl: true,
        screenshots: true,
        gameFrames: true,
      },
    });
    const frames: Deck["frames"] = [];
    for (const row of rows) {
      const urls = [...new Set(row.gameFrames.length > 0 ? row.gameFrames : row.screenshots)];
      for (const url of urls.slice(0, FRAMES_PER_TITLE)) frames.push({ animeId: row.id, url });
    }
    // Stable order first, then one seeded shuffle.
    frames.sort((x, y) => x.animeId - y.animeId || (x.url < y.url ? -1 : 1));
    const rand = mulberry32(0x5eed);
    for (let i = frames.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [frames[i], frames[j]] = [frames[j]!, frames[i]!];
    }
    const titles: Title[] = rows.map(({ screenshots: _s, gameFrames: _g, ...t }) => t);
    const deck: Deck = { at: Date.now(), titles, byId: new Map(titles.map((t) => [t.id, t])), frames };
    decks.set(allowAdult, deck);
    return deck;
  };

  const sweep = () => {
    const now = Date.now();
    for (const [id, round] of rounds) if (round.expiresAt < now) rounds.delete(id);
    while (rounds.size > MAX_ROUNDS) {
      const oldest = rounds.keys().next().value;
      if (oldest === undefined) break;
      rounds.delete(oldest);
    }
  };

  /** Ends a player's run. */
  const breakRun = (userId: string) =>
    fastify.prisma.guessScore.upsert({
      where: { userId },
      create: { userId, current: 0 },
      update: { current: 0 },
    });

  /** The next frame in this player's own walk through the deck. */
  const nextFrame = async (userId: string, deck: Deck) => {
    const size = deck.frames.length;
    const row = await fastify.prisma.guessScore.findUnique({
      where: { userId },
      select: { deckSeed: true, deckPos: true },
    });
    let seed = row?.deckSeed ?? Math.floor(Math.random() * 2_000_000_000);
    let pos = row?.deckPos ?? 0;
    // A whole deck dealt: start a fresh order.
    if (pos >= size) {
      seed = Math.floor(Math.random() * 2_000_000_000);
      pos = 0;
    }
    const frame = deck.frames[deckIndex(seed, pos, size)]!;
    await fastify.prisma.guessScore.upsert({
      where: { userId },
      create: { userId, deckSeed: seed, deckPos: pos + 1 },
      update: { deckSeed: seed, deckPos: pos + 1 },
    });
    return frame;
  };

  const deal = async (userId: string, allowAdult: boolean) => {
    const deck = await loadDeck(allowAdult);
    if (deck.titles.length < 4 || deck.frames.length === 0) {
      throw new NotFoundError("Недостаточно тайтлов для игры.");
    }
    const frame = await nextFrame(userId, deck);
    const answer = deck.byId.get(frame.animeId)!;
    const options = new Map<number, Title>([[answer.id, answer]]);
    while (options.size < 4) {
      const pick = deck.titles[Math.floor(Math.random() * deck.titles.length)]!;
      options.set(pick.id, pick);
    }
    const shuffled = [...options.values()].sort(() => Math.random() - 0.5);

    sweep();
    const roundId = randomUUID();
    const now = Date.now();
    rounds.set(roundId, { answerId: answer.id, userId, expiresAt: now + ROUND_TTL_MS, dealtAt: now });
    openRound.set(userId, roundId);
    return { roundId, frame: smallFrame(frame.url), options: shuffled };
  };

  fastify.get("/games/guess/round", { preHandler: fastify.authenticate }, async (request) => {
    const userId = request.userId!;
    const allowAdult = await resolveAllowAdult(fastify.prisma, userId);
    // Walking away from an open round is giving it up.
    const previous = openRound.get(userId);
    if (previous && rounds.has(previous)) {
      rounds.delete(previous);
      await breakRun(userId);
    }
    return deal(userId, allowAdult);
  });

  // The frame of an open, unanswered round failed to load: deal another
  // without costing the run. Limited, so it can't be used to skip hard ones.
  fastify.post("/games/guess/replace", { preHandler: fastify.authenticate }, async (request) => {
    const userId = request.userId!;
    const { roundId } = parse(replaceBody, request.body);
    const round = rounds.get(roundId);
    if (!round || round.userId !== userId || round.expiresAt < Date.now()) {
      throw new BadRequestError("Раунд устарел — возьмите новый.");
    }
    const hourAgo = Date.now() - 60 * 60_000;
    const used = (replacements.get(userId) ?? []).filter((t) => t > hourAgo);
    if (used.length >= REPLACEMENTS_PER_HOUR) {
      throw new TooManyRequestsError("Слишком много замен — попробуйте позже.");
    }
    replacements.set(userId, [...used, Date.now()]);
    rounds.delete(roundId);
    const allowAdult = await resolveAllowAdult(fastify.prisma, userId);
    return deal(userId, allowAdult);
  });

  fastify.post("/games/guess/answer", { preHandler: fastify.authenticate }, async (request) => {
    const userId = request.userId!;
    const { roundId, optionId } = parse(answerBody, request.body);
    const round = rounds.get(roundId);
    if (!round || round.expiresAt < Date.now()) {
      throw new BadRequestError("Раунд устарел — возьмите новый.");
    }
    if (round.userId !== userId) throw new BadRequestError("Это не ваш раунд.");
    rounds.delete(roundId);
    if (openRound.get(userId) === roundId) openRound.delete(userId);

    const correct = optionId === round.answerId;
    const row = await fastify.prisma.guessScore.findUnique({ where: { userId } });
    const current = correct ? (row?.current ?? 0) + 1 : 0;
    const newBest = Math.max(row?.best ?? 0, current);
    const saved = await fastify.prisma.guessScore.upsert({
      where: { userId },
      create: { userId, current, best: newBest, played: 1, bestAt: newBest > 0 ? new Date() : null },
      update: {
        current,
        best: newBest,
        played: { increment: 1 },
        ...(newBest > (row?.best ?? 0) ? { bestAt: new Date() } : {}),
      },
    });
    return { correct, answerId: round.answerId, streak: saved.current, best: saved.best };
  });

  fastify.get("/games/guess/leaderboard", { preHandler: fastify.optionalAuth }, async (request) => {
    const top = await fastify.prisma.guessScore.findMany({
      where: { best: { gt: 0 } },
      orderBy: [{ best: "desc" }, { bestAt: "asc" }],
      take: BOARD_SIZE,
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
   * Backfill: the catalogue keeps about two screenshots per title, which
   * would make a deck of barely two thousand frames. In the background, one
   * title every ~1.2 s, fetch the rest from Shikimori and keep up to eight.
   * A title done once isn't asked again; one that returned nothing is
   * skipped for the life of the process.
   */
  const tried = new Set<number>();
  let stopped = false;
  fastify.addHook("onClose", async () => {
    stopped = true;
  });
  const backfill = async () => {
    while (!stopped) {
      const batch = await fastify.prisma.anime
        .findMany({
          where: { ...POOL_WHERE, gameFrames: { isEmpty: true }, id: { notIn: [...tried] } },
          orderBy: { scoredBy: "desc" },
          take: 20,
          select: { id: true },
        })
        .catch(() => []);
      if (batch.length === 0) return;
      for (const { id } of batch) {
        if (stopped) return;
        tried.add(id);
        const shots = await catalog.fetchScreenshots(id);
        if (shots.length > 0) {
          await fastify.prisma.anime
            .update({ where: { id }, data: { gameFrames: shots.slice(0, FRAMES_PER_TITLE) } })
            .catch(() => undefined);
        }
        await new Promise((r) => setTimeout(r, BACKFILL_GAP_MS));
      }
      decks.clear();
    }
  };
  if (process.env.NODE_ENV !== "test") {
    const timer = setTimeout(() => {
      void backfill().catch((error) => fastify.log.warn({ error }, "guess frame backfill stopped"));
    }, 20_000);
    timer.unref();
  }
};
