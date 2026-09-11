-- CreateTable
CREATE TABLE "WatchAvailability" (
    "animeId" INTEGER NOT NULL,
    "hasPlayer" BOOLEAN,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchAvailability_pkey" PRIMARY KEY ("animeId")
);

-- CreateIndex
CREATE INDEX "WatchAvailability_hasPlayer_idx" ON "WatchAvailability"("hasPlayer");

-- AddForeignKey
ALTER TABLE "WatchAvailability" ADD CONSTRAINT "WatchAvailability_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
