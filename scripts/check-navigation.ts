import "../apps/api/src/config/env.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { prisma } from "../packages/db/src/index.js";
import { DEFAULT_MOBILE_NAVIGATION } from "../packages/shared/src/mobile-navigation.js";

const base = "http://127.0.0.1:4000/api";
const ids = ["qa-nav-" + randomUUID(), "qa-nav-" + randomUUID()];
const password = randomBytes(18).toString("base64url");
const { hash } = createRequire(new URL("../apps/api/package.json", import.meta.url))("bcryptjs");
const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
async function signIn(id: string) {
  const r = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${id}@example.invalid`, password }) });
  assert.equal(r.status, 200);
  return ((await r.json()) as { token: string }).token;
}
try {
  const passwordHash = await hash(password, 4);
  await prisma.user.createMany({ data: ids.map(id => ({ id, email: `${id}@example.invalid`, displayName: "Navigation QA", passwordHash, notifyPush: false, notifyTelegram: false })) });
  const a = await signIn(ids[0]!), b = await signIn(ids[1]!);
  assert.equal((await fetch(`${base}/me/navigation`)).status, 401);
  const buttons = ["search", "catalog", "notifications", "library", "support"];
  const save = await fetch(`${base}/me/navigation`, { method: "PUT", headers: headers(a), body: JSON.stringify({ buttons, userId: ids[1] }) });
  assert.equal(save.status, 200);
  assert.deepEqual(await save.json(), { buttons });
  const reload = await fetch(`${base}/me/navigation`, { headers: headers(await signIn(ids[0]!)) });
  assert.deepEqual(await reload.json(), { buttons });
  const other = await fetch(`${base}/me/navigation`, { headers: headers(b) });
  assert.deepEqual(await other.json(), { buttons: DEFAULT_MOBILE_NAVIGATION });
  for (const bad of [["home", "home", "search", "rooms", "profile"], ["home", "catalog", "library", "rooms", "profile"], ["home", "frameSearch", "search", "rooms", "profile"]]) {
    assert.equal((await fetch(`${base}/me/navigation`, { method: "PUT", headers: headers(a), body: JSON.stringify({ buttons: bad }) })).status, 422);
  }
  assert.deepEqual((await prisma.mobileNavigationPreference.findUnique({ where: { userId: ids[0]! } }))?.buttons, buttons);
  assert.equal(await prisma.mobileNavigationPreference.findUnique({ where: { userId: ids[1]! } }), null);
  console.log("PASS: authentication, persistent movable search, account isolation, invalid menu rejection");
} finally {
  await prisma.user.deleteMany({ where: { id: { in: ids }, email: { endsWith: "@example.invalid" } } });
  await prisma.$disconnect();
}
