import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@animeshadow/db";
import type { FastifyBaseLogger } from "fastify";
import { NotificationService } from "../apps/api/src/services/notification.service.ts";
import { EpisodeAvailabilityService } from "../apps/api/src/services/episode-availability.service.ts";
import type { WatchService } from "../apps/api/src/services/watch.service.ts";

const log = { info() {}, warn() {} } as unknown as FastifyBaseLogger;

test("notification deletion always includes ownership, including clear all", async () => {
  const filters: unknown[] = [];
  const prisma = { notification: { deleteMany: async (input: unknown) => { filters.push(input); return { count: 1 }; } } } as unknown as PrismaClient;
  const service = new NotificationService(prisma, log);
  await service.remove("owner", "notification");
  await service.remove("owner");
  assert.deepEqual(filters, [{ where: { userId: "owner", id: "notification" } }, { where: { userId: "owner" } }]);
});

test("availability monitor ignores dates, unavailable streams and failed provider checks", async () => {
  const observations: Map<number, number>[] = [];
  const checks: number[] = [];
  const prisma = {
    libraryEntry: { findMany: async () => [{ animeId: 1 }, { animeId: 2 }, { animeId: 3 }] },
    guestWatchSession: { findMany: async () => [{ animeId: 1 }, { animeId: 4 }] },
    episodeMark: { findMany: async () => [{ animeId: 1, latest: 4 }] },
  } as unknown as PrismaClient;
  const watch = { latestPlayableEpisode: async (id: number, after: number) => {
    checks.push(id);
    if (id === 1) { assert.equal(after, 4); return 5; }
    if (id === 2) return null;
    if (id === 3) throw new Error("Provider down");
    return 0;
  } } as unknown as WatchService;
  const notifications = { observe: async (input: Map<number, number>) => { observations.push(input); return 1; } } as unknown as NotificationService;
  await new EpisodeAvailabilityService(prisma, watch, notifications, log).check();
  assert.deepEqual(checks, [1, 2, 3, 4]);
  assert.deepEqual(observations.map((entry) => [...entry]), [[[1, 5]], [[4, 0]]]);
});
