-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "referralCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "titleUnlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReferralReward" (
    "userId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("userId","rewardId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Every account already here gets its own invite code: 8 characters from an
-- alphabet without look-alikes (no 0/O, 1/I/L), retried on the rare clash.
DO $$
DECLARE
  u RECORD;
  candidate TEXT;
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
BEGIN
  FOR u IN SELECT "id" FROM "User" WHERE "referralCode" IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..8 LOOP
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE "referralCode" = candidate);
    END LOOP;
    UPDATE "User" SET "referralCode" = candidate WHERE "id" = u."id";
  END LOOP;
END $$;
