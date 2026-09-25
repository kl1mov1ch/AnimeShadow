-- Watch time from visitors who are not signed in.
CREATE TABLE "GuestWatchSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "animeId" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL DEFAULT 1,
    "seconds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestWatchSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GuestWatchSession_createdAt_idx" ON "GuestWatchSession"("createdAt");
CREATE INDEX "GuestWatchSession_animeId_createdAt_idx" ON "GuestWatchSession"("animeId", "createdAt");
CREATE INDEX "GuestWatchSession_visitorId_createdAt_idx" ON "GuestWatchSession"("visitorId", "createdAt");
