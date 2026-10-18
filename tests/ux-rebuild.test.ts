import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@animeshadow/db";
import type { FastifyBaseLogger } from "fastify";
import { createRequire } from "node:module";
import { ACHIEVEMENTS, ACHIEVEMENT_MILESTONES } from "../packages/shared/src/achievements.ts";
import { PROFILE_TITLES, cosmeticUnlocked } from "../packages/shared/src/profile.ts";
import { FactsService } from "../apps/api/src/services/facts.service.ts";
import { AchievementService } from "../apps/api/src/services/achievement.service.ts";
import { DeliveryService } from "../apps/api/src/services/delivery.service.ts";
import { partyAnime } from "../apps/api/src/services/party-artwork.ts";
import { youtubeTrailer } from "../apps/web/src/lib/youtube-trailer.ts";

test("100 distinct facts survive a partial catalogue; only existing accessible anime get links", async () => {
  let requests = 0;
  const prisma = { anime: { findMany: async () => { requests++; return [{ id: 513, slug: "513-laputa", title: "Laputa", titleLocalized: null, imageLargeUrl: "/large.jpg", imageUrl: "/small.jpg" }]; } } } as unknown as PrismaClient;
  const service = new FactsService({ prisma });
  const result = await service.random(100);
  assert.equal(result.total, 100);
  assert.equal(new Set(result.facts.map(f => f.id)).size, 100);
  assert.ok(result.facts.some(f => f.anime?.image === "/large.jpg"));
  assert.ok(result.facts.some(f => f.anime === null));
  assert.equal(result.facts.filter(f => f.source).length, 73);
  assert.equal((await service.random(4)).facts.length, 4);
  assert.equal(requests, 1);
});

test("new achievements have real thresholds and earned titles stay locked until earned", () => {
  const service = new AchievementService({ prisma: {} as PrismaClient });
  for (const milestone of ACHIEVEMENT_MILESTONES) {
    assert.ok(ACHIEVEMENTS.some(a => a.id === milestone.id));
    const input = { [milestone.counter]: milestone.target - 1 } as Parameters<typeof service["evaluate"]>[1];
    assert.equal(service["evaluate"](milestone.id, input).earned, false);
    input[milestone.counter] = milestone.target;
    assert.equal(service["evaluate"](milestone.id, input).earned, true);
    assert.equal(cosmeticUnlocked(PROFILE_TITLES, milestone.id, []), false);
    assert.equal(cosmeticUnlocked(PROFILE_TITLES, milestone.id, [milestone.id]), true);
  }
});

test("room covers prefer wide artwork and retain a high-resolution poster fallback", () => {
  const anime = { id: 1, slug: "one", title: "One", titleLocalized: null, imageUrl: "small", imageLargeUrl: "large", bannerImage: "banner", screenshots: ["frame"], episodes: 12 };
  assert.equal(partyAnime(anime).coverUrl, "banner");
  assert.equal(partyAnime(anime).imageUrl, "large");
  assert.equal(partyAnime({ ...anime, bannerImage: null }).coverUrl, "frame");
  assert.equal(partyAnime({ ...anime, bannerImage: null, screenshots: [] }).coverUrl, "large");
});

test("trailers accept actual YouTube links, rejecting unrelated embed origins", () => {
  assert.match(youtubeTrailer("https://youtu.be/abcdefghijk")!.embed, /^https:\/\/www.youtube-nocookie.com\/embed\/abcdefghijk\?/);
  assert.equal(youtubeTrailer("https://youtube.com/watch?v=abcdefghijk")?.watch, "https://www.youtube.com/watch?v=abcdefghijk");
  for (const value of ["https://evil.example/embed/abcdefghijk", "https://youtube.com.evil.example/watch?v=abcdefghijk", "javascript:alert(1)", "https://youtube.com/watch?v=bad"]) assert.equal(youtubeTrailer(value), null);
});

test("Telegram link is single-use, binds only after Start, and unlink does not report a login identity as a bot connection", async (t) => {
  const { generateVAPIDKeys } = createRequire(new URL("../apps/api/package.json", import.meta.url))("web-push");
  const keys = generateVAPIDKeys() as { publicKey: string; privateKey: string };
  let code: { userId: string; expiresAt: Date } | null = { userId: "owner", expiresAt: new Date(Date.now() + 60_000) };
  const binds: unknown[] = [];
  const tx = {
    telegramLinkCode: { findUnique: async () => code, deleteMany: async () => { const count = code ? 1 : 0; code = null; return { count }; } },
    user: { updateMany: async () => ({ count: 1 }), update: async (arg: unknown) => { binds.push(arg); return {}; } },
  };
  const prisma = { ...tx, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
    user: { ...tx.user, findUnique: async () => ({ displayName: "QA", telegramId: "123", telegramChatId: null, notifyTelegram: false }) },
    pushSubscription: { count: async () => 0 },
  } as unknown as PrismaClient;
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => { methods.push(url.split("/").at(-1)!); return Response.json({ ok: true, result: { username: "test_bot" } }); });
  const service = new DeliveryService(prisma, { warn() {}, info() {} } as unknown as FastifyBaseLogger, { telegramToken: "fixture", telegramPolling: false, vapidSubject: "mailto:qa@example.invalid", vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey, appUrl: "https://example.invalid" });
  const update = { message: { text: "/start once", chat: { id: 123, type: "private" } } } as Parameters<typeof service["onUpdate"]>[0];
  await service["onUpdate"](update);
  await service["onUpdate"](update);
  assert.equal(binds.length, 1);
  assert.equal((await service.settings("owner")).telegram.connected, false);
  assert.ok(methods.includes("sendMessage")); // Intercepted locally; no real message sent.
  t.mock.restoreAll();
  let lookups = 0;
  t.mock.method(globalThis, "fetch", async () => { lookups++; return Response.json({ ok: false, error_code: 401 }, { status: 401 }); });
  const unavailable = new DeliveryService(prisma, { warn() {}, info() {} } as unknown as FastifyBaseLogger, { telegramToken: "invalid-fixture", telegramPolling: false, vapidSubject: "mailto:qa@example.invalid", vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey, appUrl: "https://example.invalid" });
  const results = await Promise.all([unavailable.settings("owner"), unavailable.settings("owner"), unavailable.settings("owner")]);
  assert.ok(results.every(result => !result.telegram.available));
  await unavailable.settings("owner");
  assert.equal(lookups, 1); // Coalesced lookup and a bounded retry delay after 401.
});
