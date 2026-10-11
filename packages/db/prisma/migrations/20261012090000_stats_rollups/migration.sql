-- DropIndex
DROP INDEX "GuestWatchSession_animeId_createdAt_idx";

-- DropIndex
DROP INDEX "GuestWatchSession_createdAt_idx";

-- DropIndex
DROP INDEX "GuestWatchSession_visitorId_createdAt_idx";

-- DropIndex
DROP INDEX "PageView_sessionId_idx";

-- CreateTable
CREATE TABLE "VisitorFirstSeen" (
    "visitorId" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorFirstSeen_pkey" PRIMARY KEY ("visitorId")
);

-- CreateTable
CREATE TABLE "StatDay" (
    "day" DATE NOT NULL,
    "audience" TEXT NOT NULL,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "bounces" INTEGER NOT NULL DEFAULT 0,
    "sessionSec" INTEGER NOT NULL DEFAULT 0,
    "newVisitors" INTEGER NOT NULL DEFAULT 0,
    "watchSec" INTEGER NOT NULL DEFAULT 0,
    "watchSessions" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StatDay_pkey" PRIMARY KEY ("day","audience")
);

-- CreateTable
CREATE TABLE "StatDayKey" (
    "day" DATE NOT NULL,
    "dim" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uniques" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StatDayKey_pkey" PRIMARY KEY ("day","dim","key")
);

-- CreateIndex
CREATE INDEX "VisitorFirstSeen_firstAt_idx" ON "VisitorFirstSeen"("firstAt");

-- CreateIndex
CREATE INDEX "StatDayKey_dim_day_idx" ON "StatDayKey"("dim", "day");

-- CreateIndex
CREATE INDEX "CollectionView_userId_idx" ON "CollectionView"("userId");

-- CreateIndex
CREATE INDEX "GuestWatchSession_startedAt_idx" ON "GuestWatchSession"("startedAt");

-- CreateIndex
CREATE INDEX "GuestWatchSession_animeId_startedAt_idx" ON "GuestWatchSession"("animeId", "startedAt");

-- CreateIndex
CREATE INDEX "GuestWatchSession_visitorId_startedAt_idx" ON "GuestWatchSession"("visitorId", "startedAt");

-- CreateIndex
CREATE INDEX "WatchSession_animeId_startedAt_idx" ON "WatchSession"("animeId", "startedAt");


-- Every browser seen so far, with its first visit — from here on the
-- analytics batch writer keeps this table up to date itself.
INSERT INTO "VisitorFirstSeen" ("visitorId", "firstAt")
SELECT "visitorId", MIN("createdAt") FROM "PageView" GROUP BY "visitorId"
ON CONFLICT ("visitorId") DO NOTHING;
