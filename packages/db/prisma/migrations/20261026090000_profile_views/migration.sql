-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileViews" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProfileVisit" (
    "profileId" TEXT NOT NULL,
    "viewerKey" TEXT NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("profileId","viewerKey")
);

-- CreateIndex
CREATE INDEX "ProfileVisit_lastAt_idx" ON "ProfileVisit"("lastAt");

