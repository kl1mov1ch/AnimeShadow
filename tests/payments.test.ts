import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@animeshadow/db";
import { addMonthsClamped, moneyMinor, mulenSignature, MulenPayService } from "../apps/api/src/services/mulenpay.service.ts";

test("payment amounts use exact minor units and reject exponent, sign and excess precision", () => {
  assert.equal(moneyMinor("299.90"), 29990);
  assert.equal(moneyMinor("1.5"), 150);
  for (const value of ["1e3", "-1", "Infinity", "1.001", "100 RUB"]) assert.equal(moneyMinor(value), null);
  assert.equal(mulenSignature("rub", "299.00", 12, "secret"), createHash("sha1").update("rub299.0012secret").digest("hex"));
});

test("PRO subscription months clamp end-of-month and preserve the time", () => {
  assert.equal(addMonthsClamped(new Date("2027-01-31T16:20:00Z"), 1).toISOString(), "2027-02-28T16:20:00.000Z");
  assert.equal(addMonthsClamped(new Date("2027-01-31T16:20:00Z"), 3).toISOString(), "2027-04-30T16:20:00.000Z");
});

test("disabled payment integration makes no upstream or database requests", async () => {
  let requests = 0;
  const service = new MulenPayService({} as PrismaClient, { enabled: false, prices: {} }, async () => { requests++; throw new Error(); });
  assert.deepEqual(await service.plans(), { available: false, plans: [] });
  await assert.rejects(service.create("user", 1, "id", 29900));
  assert.equal(requests, 0);
});

test("a forged successful callback cannot grant PRO when the authenticated API reports pending", async () => {
  let granted = 0;
  const invoice = { id: "invoice", userId: "viewer", providerId: 44, months: 1, amountMinor: 29900, currency: "rub", status: "pending", processedAt: null };
  const tx = { $queryRaw: async () => [], supportPayment: { findUniqueOrThrow: async () => invoice, update: async () => {} }, user: { update: async () => { granted++; } } };
  const prisma = { supportPayment: { findFirst: async () => invoice, findUnique: async () => ({ id: invoice.id }) }, $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
  const service = new MulenPayService(prisma, { enabled: true, apiKey: "test", secretKey: "test", shopId: 1, prices: { "1": "299" } }, async () => Response.json({ success: true, payment: { id: 44, uuid: "invoice", amount: "299.00", currency: "RUB", status: 1 } }));
  assert.deepEqual(await service.callback(44), { id: "invoice", status: "pending" });
  assert.equal(granted, 0);
});

test("verified payment identity, currency and amount must all match before entitlement changes", async () => {
  const invoice = { id: "invoice", userId: "viewer", providerId: 44, months: 1, amountMinor: 29900, currency: "rub", processedAt: null };
  const prisma = { supportPayment: { findFirst: async () => invoice } } as unknown as PrismaClient;
  for (const changed of [{ amount: "1.00" }, { currency: "USD" }, { uuid: "someone-else" }, { id: 45 }]) {
    const service = new MulenPayService(prisma, { enabled: true, apiKey: "test", secretKey: "test", shopId: 1, prices: { "1": "299" } }, async () => Response.json({ success: true, payment: { id: 44, uuid: "invoice", amount: "299.00", currency: "rub", status: 3, ...changed } }));
    await assert.rejects(service.verify("invoice", "viewer"), /не совпали/);
  }
});
