import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@animeshadow/db";
import type { ServerResponse } from "node:http";
import { PartyService } from "../apps/api/src/services/party.service.ts";
import type { PartyStore } from "../apps/api/src/services/party-store.ts";
import type { DeliveryService } from "../apps/api/src/services/delivery.service.ts";
import { decodeRoom } from "../apps/api/src/services/party-codec.ts";
import { episodeDuration } from "../apps/api/src/services/party-program.ts";

const anime = (id: number) => ({ id, slug: `${id}-anime`, title: `Anime ${id}`, titleLocalized: null, imageUrl: null, episodes: 3 });
const prisma = {
  user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, displayName: where.id, avatarUrl: null, proSince: where.id === "creator" ? new Date(1) : null, proUntil: null, trialUntil: null }) },
  anime: { findUnique: async ({ where }: { where: { id: number } }) => anime(where.id) },
} as unknown as PrismaClient;
const delivery = { room: async () => 0 } as unknown as DeliveryService;
const stream = () => ({ writableEnded: false, destroyed: false, writableLength: 0, write() {}, end() {} }) as unknown as ServerResponse;
function memoryStore() {
  const saved = new Map<string, unknown>();
  const store: PartyStore = { load: async () => [...saved.values()], save: async (key, value) => { saved.set(key, structuredClone(value)); }, remove: async (key) => { saved.delete(key); }, flush: async () => {} };
  return { saved, store };
}

test("restart restores named rooms, playback, queue and five-minute return grace", async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  const { store } = memoryStore();
  const first = new PartyService(prisma, delivery, "https://example.test", "__unused__", store);
  const { code } = await first.create("creator", 1, 1, "link", "Вечер с друзьями");
  const disconnect = await first.connect(code, "creator", stream());
  await first.playback(code, "creator", { episode: 1, playing: true, position: 35, sourceId: "voice-one" });
  await first.propose(code, "creator", 2);
  now += 7000;
  await first.dispose(); disconnect();
  now += 30_000;
  const second = new PartyService(prisma, delivery, "https://example.test", "__unused__", store);
  t.after(() => second.dispose());
  await second.restore();
  const restored = second.snapshot(code);
  assert.equal(restored.name, "Вечер с друзьями");
  assert.equal(restored.playback.position, 42);
  assert.equal(restored.playback.sourceId, "voice-one");
  assert.equal(restored.playback.playing, false);
  assert.equal(restored.queue[0]?.anime.id, 2);
  assert.equal(restored.members.length, 0);
  now += 5 * 60_000 - 1;
  (second as unknown as { sweep(): void }).sweep();
  assert.doesNotThrow(() => second.snapshot(code));
  now += 1;
  (second as unknown as { sweep(): void }).sweep();
  assert.throws(() => second.snapshot(code));
  assert.equal(decodeRoom({ version: 1, code: "broken" }), null);
});

test("main broadcast uses server time, a single vote and automatic continuation without a host", async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  const { store } = memoryStore();
  const program = async (id = 1, episode = 1) => id > 2 || episode > 2 ? null : { anime: anime(id), episode, durationSeconds: 60, sourceId: `source-${id}`, availableEpisodes: [1, 2] };
  const first = new PartyService(prisma, delivery, "https://example.test", "__unused__", store, program);
  const initial = await first.main();
  assert.equal(initial?.official, true);
  assert.equal(initial?.capacity, 200);
  const disconnect = await first.connect("main-live", "free-viewer", stream());
  assert.doesNotThrow(() => first.chat("main-live", "free-viewer", { text: "Приятного просмотра!" }));
  await assert.rejects(first.playback("main-live", "free-viewer", { episode: 1, position: 0, playing: false }));
  await first.propose("main-live", "free-viewer", 2);
  assert.equal(first.snapshot("main-live").queue[0]?.votes.length, 1);
  first.voteNext("main-live", "free-viewer");
  assert.equal(first.snapshot("main-live").queue[0]?.votes.length, 0);
  assert.equal(first.snapshot("main-live").nextVotes?.length, 1);
  first.vote("main-live", "free-viewer", 2);
  assert.equal(first.snapshot("main-live").nextVotes?.length, 0);
  now += 60_000;
  const selected = await first.main();
  assert.equal(selected?.anime.id, 2);
  assert.equal(selected?.playback.episode, 1);
  assert.equal(selected?.queue.length, 0);
  assert.equal(selected?.nextVotes?.length, 0);
  assert.equal(first.leave("main-live", "free-viewer").closed, false);
  disconnect();
  now += 10_000;
  await first.dispose();
  now += 10_000;
  const second = new PartyService(prisma, delivery, "https://example.test", "__unused__", store, program);
  t.after(() => second.dispose());
  await second.restore();
  assert.equal((await second.main())?.playback.playing, true);
  now += 50_000;
  assert.equal((await second.main())?.playback.episode, 2);
  assert.equal((await second.main())?.anime.id, 2);
});

test("broadcast duration accepts actual hours/minutes and rejects unknown estimates", () => {
  assert.equal(episodeDuration("24 min per ep"), 1440);
  assert.equal(episodeDuration("1 hr 36 min"), 5760);
  assert.equal(episodeDuration("23 мин."), 1380);
  assert.equal(episodeDuration("Unknown"), null);
  assert.equal(episodeDuration("0 min"), null);
});
