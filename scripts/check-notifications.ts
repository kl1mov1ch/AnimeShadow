import "../apps/api/src/config/env.js";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../packages/db/dist/index.js";
import { NotificationService } from "../apps/api/src/services/notification.service.js";
const animeId = randomInt(900_000_000, 999_999_999);
const users: string[] = [];
let createdAnime = false;
try {
  await prisma.anime.create({ data: { id: animeId, slug: `qa-${animeId}`, title: "QA notification fixture", screenshots: [] } });
  createdAnime = true;
  for (let i = 0; i < 2; i++) {
    const user = await prisma.user.create({ data: { email: `qa-notify-${randomUUID()}@example.invalid`, displayName: "QA notifications", passwordHash: `!qa-test-${randomUUID()}` } });
    users.push(user.id);
    await prisma.libraryEntry.create({ data: { userId: user.id, animeId, status: "WATCHING" } });
  }
  let delivered = 0;
  const service = new NotificationService(prisma, { info() {}, warn() {} } as unknown as FastifyBaseLogger,
    async items => { delivered += items.length; });
  assert.equal(await service.observe(new Map([[animeId, 0]])), 0);
  const result = await Promise.all([service.observe(new Map([[animeId, 1]])), service.observe(new Map([[animeId, 1]]))]);
  assert.equal(result.reduce((a, b) => a + b, 0), 2);
  assert.equal(delivered, 2);
  assert.equal(await service.unread(users[0]!), 1);
  const theirs = (await service.list(users[1]!)).items[0]!;
  assert.equal(await service.remove(users[0]!, theirs.id), 0);
  assert.equal(await service.remove(users[0]!), 1);
  assert.equal(await service.unread(users[0]!), 0);
  assert.equal(await service.unread(users[1]!), 1);
  console.log(JSON.stringify({ zeroBaseline: true, concurrentChecksDeduplicated: true, ownershipEnforced: true, unreadUpdated: true }));
} finally {
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (createdAnime) {
    await prisma.episodeMark.deleteMany({ where: { animeId } });
    await prisma.anime.delete({ where: { id: animeId } });
  }
  await prisma.$disconnect();
  console.log(JSON.stringify({ testFixturesRemoved: true }));
}
