import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import type { PrismaClient } from "@animeshadow/db";
import type { FastifyBaseLogger } from "fastify";
import { DeliveryService } from "../apps/api/src/services/delivery.service.ts";
import { activePushRegistration, findPushRegistration, subscribeWithCurrentKey } from "../apps/web/src/lib/push-registration.ts";

const log = { info() {}, warn() {} } as unknown as FastifyBaseLogger;
const { generateVAPIDKeys } = createRequire(new URL("../apps/api/package.json", import.meta.url))("web-push") as { generateVAPIDKeys(): { publicKey: string; privateKey: string } };
const keys = generateVAPIDKeys();
const config = { telegramToken: "fixture", telegramPolling: false, vapidSubject: "mailto:qa@example.invalid", vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey, appUrl: "https://example.invalid" };

test("plain Telegram Start persists chat for a Telegram login and clears the blocked flag", async t => {
  let user = { id: "owner", displayName: "QA", telegramId: "123", telegramChatId: null as string | null, notifyTelegram: false, telegramBlockedAt: new Date() as Date | null };
  const writes: unknown[] = [];
  const prisma = { user: {
    findFirst: async () => null,
    findUnique: async () => user,
    update: async (input: { data: Partial<typeof user> }) => { writes.push(input); user = { ...user, ...input.data }; return user; },
  }, pushSubscription: { count: async () => 0 } } as unknown as PrismaClient;
  const service = new DeliveryService(prisma, log, config);
  t.mock.method(service["commands"], "help", async () => ({ text: "Connected" }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, result: { username: "qa_bot" } }));
  await service["onUpdate"]({ update_id: 1, message: { text: "/start", chat: { id: 123, type: "private" } } });
  assert.deepEqual(writes, [{ where: { id: "owner" }, data: { telegramChatId: "123", telegramBlockedAt: null, notifyTelegram: true } }]);
  assert.equal((await service.settings("owner")).telegram.connected, true);
});

test("Telegram diagnostic reports rejected token independently of push", async t => {
  const prisma = { user: { findUnique: async () => ({ notifyTelegram: false, notifyPush: true }) }, pushSubscription: { count: async () => 0 } } as unknown as PrismaClient;
  const service = new DeliveryService(prisma, log, config);
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: false, error_code: 401 }, { status: 401 }));
  const result = await service.test("owner", "telegram");
  assert.equal(result.telegram, false);
  assert.equal(result.push, 0);
  assert.match(result.telegramError!, /401/);
  assert.equal((await service.settings("owner")).telegram.issue, "token-rejected");
});

test("a disabled Telegram receiver cannot hand out an unusable Start link", async t => {
  const service = new DeliveryService({} as PrismaClient, log, config);
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, result: { username: "qa_bot" } }));
  await assert.rejects(service.telegramLink("owner"), /Приём команд Telegram отключён/);
});

test("push server state is checked against both endpoint and account", async () => {
  let filter: unknown;
  const prisma = { user: { findUnique: async () => ({ notifyPush: false }) }, pushSubscription: { count: async (input: unknown) => { filter = input; return 0; } } } as unknown as PrismaClient;
  const service = new DeliveryService(prisma, log, config);
  assert.deepEqual(await service.pushStatus("owner", "https://push.example.invalid/sub"), { registered: false, enabled: false });
  assert.deepEqual(filter, { where: { userId: "owner", endpoint: "https://push.example.invalid/sub" } });
});

test("the root cache worker is never mistaken for the push worker", async () => {
  const container = { getRegistration: async () => ({ scope: "https://example.invalid/", active: { scriptURL: "https://example.invalid/sw.js" } }) } as unknown as ServiceWorkerContainer;
  assert.equal(await findPushRegistration(container, "https://example.invalid"), undefined);
});

test("push activation uses its own scope and rejects inactive workers instead of a false success", async () => {
  const registration = Object.assign(new EventTarget(), { active: null, waiting: null, installing: null }) as unknown as ServiceWorkerRegistration;
  let options: unknown;
  const container = { register: async (_url: string, input: unknown) => { options = input; return registration; } } as unknown as ServiceWorkerContainer;
  await assert.rejects(activePushRegistration(container, 5), /worker-timeout/);
  assert.deepEqual(options, { scope: "/push/", updateViaCache: "none" });
});

test("a subscription is replaced after VAPID rotation but reused while compatible", async () => {
  const currentKey = new Uint8Array([1, 2, 3]);
  let unsubscribed = 0;
  let subscribed = 0;
  const forgotten: string[] = [];
  const fresh = { endpoint: "fresh" } as PushSubscription;
  let existing = { endpoint: "old", options: { applicationServerKey: new Uint8Array([4, 5, 6]).buffer }, expirationTime: null, unsubscribe: async () => { unsubscribed++; return true; } } as PushSubscription;
  const registration = { pushManager: { getSubscription: async () => existing, subscribe: async () => { subscribed++; return fresh; } } } as unknown as ServiceWorkerRegistration;
  assert.equal(await subscribeWithCurrentKey(registration, currentKey, async endpoint => { forgotten.push(endpoint); }), fresh);
  assert.equal(unsubscribed, 1);
  assert.equal(subscribed, 1);
  assert.deepEqual(forgotten, ["old"]);
  existing = { ...existing, options: { applicationServerKey: currentKey.buffer } } as PushSubscription;
  assert.equal(await subscribeWithCurrentKey(registration, currentKey, async () => undefined), existing);
  assert.equal(subscribed, 1);
});
