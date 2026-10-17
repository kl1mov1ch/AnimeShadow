CREATE TABLE "SupportPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerId" INTEGER,
  "months" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'rub',
  "status" TEXT NOT NULL DEFAULT 'creating',
  "checkoutUrl" TEXT,
  "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consentVersion" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportPayment_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "SupportPayment_months_check" CHECK ("months" IN (1, 3, 12))
);
CREATE UNIQUE INDEX "SupportPayment_providerId_key" ON "SupportPayment"("providerId");
CREATE INDEX "SupportPayment_userId_createdAt_idx" ON "SupportPayment"("userId", "createdAt");
ALTER TABLE "SupportPayment" ADD CONSTRAINT "SupportPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
