-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "visitorId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PushSubscription_visitorId_idx" ON "PushSubscription"("visitorId");

