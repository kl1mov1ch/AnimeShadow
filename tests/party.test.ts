import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerResponse } from "node:http";
import type { PrismaClient } from "@animeshadow/db";
import { PartyService } from "../apps/api/src/services/party.service.ts";
import type { DeliveryService } from "../apps/api/src/services/delivery.service.ts";

test("rooms survive host departures, reloads and age; expire only when unvisited or empty", async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  const news: Array<{ userId: string; tag: string; url: string }> = [];
  const prisma = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, displayName: where.id, avatarUrl: null, proSince: new Date(now), proUntil: null, trialUntil: null }) },
    anime: { findUnique: async () => ({ id: 21, slug: "21-one-piece", title: "One Piece", titleLocalized: "Ван-Пис", imageUrl: null, episodes: 1200 }) },
    follow: { findMany: async () => [] },
  } as unknown as PrismaClient;
  const delivery = { room: async (userId: string, msg: { tag: string; url: string }) => { news.push({ userId, ...msg }); return 1; } } as unknown as DeliveryService;
  const service = new PartyService(prisma, delivery, "https://anime.example", "__unused_party_test_log__");
  t.after(() => service.dispose());
  const sweep = () => (service as unknown as { sweep(): void }).sweep();
  const stream = () => ({ writableEnded: false, destroyed: false, writableLength: 0, write() {}, end() {} }) as unknown as ServerResponse;

  const { code } = await service.create("creator", 21, 1);
  const host = await service.connect(code, "creator", stream());
  const guest = await service.connect(code, "guest", stream());
  assert.equal(service.leave(code, "creator").closed, false);
  assert.equal(service.snapshot(code).hostId, "guest");
  host(); // The old SSE close callback must not erase the guest or reset the deadline.
  now += 13 * 3_600_000; sweep();
  assert.equal(service.snapshot(code).members.length, 1);
  guest();
  now += 4 * 60_000; sweep();
  assert.equal(service.snapshot(code).members.length, 0);
  const rejoined = await service.connect(code, "guest", stream());
  now += 2 * 60_000; sweep();
  assert.equal(service.snapshot(code).members.length, 1);
  rejoined();
  now += 5 * 60_000 - 1; sweep();
  assert.doesNotThrow(() => service.snapshot(code));
  now += 1; sweep(); sweep();
  assert.throws(() => service.snapshot(code));
  const closed = news.filter((n) => n.tag.endsWith("-closed"));
  assert.equal(closed.length, 1);
  assert.equal(closed[0]?.userId, "creator");
  assert.equal(closed[0]?.url, "https://anime.example/anime/21-one-piece");

  const untouched = await service.create("creator", 21, 1, "link");
  assert.ok((await service.list("creator")).some((room) => room.code === untouched.code && room.mine));
  assert.equal((await service.list(undefined)).length, 0);
  now += 60 * 60_000 - 1; sweep();
  assert.doesNotThrow(() => service.snapshot(untouched.code));
  now += 1; sweep();
  assert.throws(() => service.snapshot(untouched.code));

  const reload = await service.create("creator", 21, 1);
  const first = await service.connect(reload.code, "creator", stream());
  const other = await service.connect(reload.code, "guest", stream());
  first(); now += 10_000;
  const back = await service.connect(reload.code, "creator", stream());
  now += 30_000; sweep();
  assert.equal(service.snapshot(reload.code).hostId, "creator");
  back(); now += 20_000; sweep();
  assert.equal(service.snapshot(reload.code).hostId, "guest");
  const another = await service.create("creator", 21, 1);
  assert.doesNotThrow(() => service.snapshot(reload.code));
  assert.doesNotThrow(() => service.snapshot(another.code));
  other();
});
