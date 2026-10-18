import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@animeshadow/db";
import type { ServerResponse } from "node:http";
import { PartyService } from "../apps/api/src/services/party.service.ts";
import type { PartyStore } from "../apps/api/src/services/party-store.ts";
import type { DeliveryService } from "../apps/api/src/services/delivery.service.ts";
import { decodeRoom } from "../apps/api/src/services/party-codec.ts";
import { createPartyProgram, episodeDuration } from "../apps/api/src/services/party-program.ts";
import type { WatchResponse } from "../packages/shared/src/watch.ts";

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
  const creatorDisconnect = await first.connect("main-live", "creator", stream());
  assert.doesNotThrow(() => first.chat("main-live", "free-viewer", { text: "Приятного просмотра!" }));
  await assert.rejects(first.playback("main-live", "free-viewer", { episode: 1, position: 0, playing: false }));
  await assert.rejects(first.propose("main-live", "free-viewer", 2), /PRO/);
  await first.propose("main-live", "creator", 2);
  assert.equal(first.snapshot("main-live").queue[0]?.votes.length, 1);
  first.voteNext("main-live", "creator");
  assert.equal(first.snapshot("main-live").queue[0]?.votes.length, 0);
  assert.equal(first.snapshot("main-live").nextVotes?.length, 1);
  first.vote("main-live", "creator", 2);
  assert.equal(first.snapshot("main-live").nextVotes?.length, 0);
  now += 60_000;
  const selected = await first.main();
  assert.equal(selected?.anime.id, 2);
  assert.equal(selected?.playback.episode, 1);
  assert.equal(selected?.queue.length, 0);
  assert.equal(selected?.nextVotes?.length, 0);
  assert.equal(first.leave("main-live", "free-viewer").closed, false);
  creatorDisconnect();
  disconnect();
  now += 10_000;
  await first.dispose();
  now += 10_000;
  const second = new PartyService(prisma, delivery, "https://example.test", "__unused__", store, program);
  t.after(() => second.dispose());
  await second.restore();
  assert.equal((await second.main())?.playback.playing, false);
  t.after(await second.connect("main-live", "free-viewer", stream()));
  now += 60_000;
  assert.equal((await second.main())?.playback.episode, 2);
  assert.equal((await second.main())?.anime.id, 2);
});

test("public rooms are independent, sleep while empty, resume at the same moment and share chat history", async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  let resolutions = 0;
  const program = async (id = 1, episode = 1) => { resolutions++; return { anime: anime(id), episode, durationSeconds: 60, availableEpisodes: [1, 2, 3] }; };
  const service = new PartyService(prisma, delivery, "https://example.test", "__unused__", undefined, program);
  t.after(() => service.dispose());
  const rooms = await service.publicRooms();
  assert.equal(rooms.length, 3);
  assert.equal(new Set(rooms.map((room) => room.code)).size, 3);
  assert.ok(rooms.every((room) => !room.playback.playing && room.chat.length === 0));
  const before = resolutions;
  now += 3_600_000;
  (service as unknown as { sweep(): void }).sweep();
  assert.equal(resolutions, before);
  const disconnect = await service.connect("main-live", "creator", stream());
  for (let i = 0; i < 125; i++) service.chat("main-live", "creator", { text: `История ${i}` });
  const frames: string[] = [];
  const newcomer = await service.connect("main-live", "new-viewer", { ...stream(), write: (frame: string) => { frames.push(frame); } } as unknown as ServerResponse);
  const hello = JSON.parse(frames[0]!.slice(6).trim());
  assert.ok(hello.party.chat.some((message: { text: string }) => message.text === "История 124"));
  assert.equal(hello.party.chat.length, 120);
  assert.equal(service.history("main-live", "new-viewer").messages.length, 120);
  await service.propose("main-live", "creator", 2, 3);
  assert.equal(service.snapshot("main-live").queue[0]?.episode, 3);
  now += 21_000;
  disconnect(); newcomer();
  assert.equal(service.snapshot("main-live").playback.playing, false);
  const frozen = service.snapshot("main-live").playback.position;
  now += 3_600_000;
  (service as unknown as { sweep(): void }).sweep();
  assert.equal(resolutions, before + 1);
  assert.equal(service.snapshot("main-live").playback.position, frozen);
  assert.throws(() => service.history("main-live", "new-viewer"));
  t.after(await service.connect("main-live", "new-viewer", stream()));
  assert.equal(service.snapshot("main-live").playback.position, frozen);
  assert.equal(service.snapshot("main-live").playback.playing, true);
  assert.equal(service.snapshot("lounge-live").playback.playing, false);
  now += 40_000;
  await service.main();
  assert.equal(service.snapshot("main-live").anime.id, 2);
  assert.equal(service.snapshot("main-live").playback.episode, 3);
});

test("a dynamic direct source does not require a persisted HLS row or known catalogue duration", async () => {
  let where: unknown;
  const db = { anime: { findMany: async (query: { where: unknown }) => { where = query.where; return [{ ...anime(57555), duration: null }]; } } } as unknown as PrismaClient;
  const source = { id: "kodik:123", title: "Studio", kind: "voice", format: "hls", embedUrl: "", hlsEpisodes: { "3": "/api/anime/57555/streams/kodik/123/3/master.m3u8" }, quality: null, episodesCount: 3, stable: false };
  const program = createPartyProgram(db, { getSources: async () => ({ available: true, reason: "ok", provider: "kodik", sources: [source] } as WatchResponse) });
  const pick = await program(57555, 3);
  assert.equal(pick?.episode, 3);
  assert.equal(pick?.sourceId, "kodik:123");
  assert.equal(pick?.durationSeconds, null);
  assert.equal(JSON.stringify(where).includes("playerSources"), false);
  assert.equal(await program(57555, 2), null);
});

test("broadcast duration accepts actual hours/minutes and rejects unknown estimates", () => {
  assert.equal(episodeDuration("24 min per ep"), 1440);
  assert.equal(episodeDuration("1 hr 36 min"), 5760);
  assert.equal(episodeDuration("23 мин."), 1380);
  assert.equal(episodeDuration("Unknown"), null);
  assert.equal(episodeDuration("0 min"), null);
});
