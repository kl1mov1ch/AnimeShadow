import "../apps/api/src/config/env.js";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { prisma } from "../packages/db/src/index.js";
import { LEGAL_VERSION } from "../packages/shared/src/index.js";
import { addMonthsClamped, MulenPayService } from "../apps/api/src/services/mulenpay.service.js";

const userId = `qa-payment-${randomUUID()}`;
const invoiceId = randomUUID();
const trialUntil = new Date(Date.now() + 86_400_000);
try {
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.invalid`, displayName: "Disposable payment QA", passwordHash: "!invalid-qa-hash", trialUntil } });
  await prisma.supportPayment.create({ data: { id: invoiceId, userId, months: 1, amountMinor: 29900, providerId: 2_000_000_000, status: "pending", consentVersion: LEGAL_VERSION } });
  let checked = 0;
  const service = new MulenPayService(prisma, { enabled: true, apiKey: "qa-only", secretKey: "qa-only", shopId: 1, prices: { "1": "299.00" } }, async (input) => {
    assert.equal(String(input), "https://mulenpay.ru/api/v2/payments/2000000000");
    checked++;
    return Response.json({ success: true, payment: { id: 2_000_000_000, uuid: invoiceId, amount: "299.00", currency: "rub", status: 3 } });
  });
  await assert.rejects(service.verify(invoiceId, "someone-else"));
  assert.equal(checked, 0);
  const results = await Promise.all([service.verify(invoiceId, userId), service.verify(invoiceId, userId), service.callback(2_000_000_000)]);
  assert.ok(results.every((result) => result.status === "paid"));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.proUntil?.toISOString(), addMonthsClamped(trialUntil, 1).toISOString());
  const before = checked;
  await service.verify(invoiceId, userId);
  assert.equal(checked, before);
  console.log(JSON.stringify({ ownership: "passed", parallelCallbacks: "passed", entitlement: "extended once, preserving trial", repeatedCallback: "passed", externalPaymentsCreated: 0 }));
} finally {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
