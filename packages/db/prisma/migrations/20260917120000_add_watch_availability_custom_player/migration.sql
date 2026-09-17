-- AlterTable
ALTER TABLE "WatchAvailability" ADD COLUMN     "hasCustomPlayer" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "WatchAvailability_hasCustomPlayer_idx" ON "WatchAvailability"("hasCustomPlayer");

-- Backfill: a title already resolved before this migration has its HLS
-- source sitting in PlayerSource already — no need to wait for its next
-- 3-day recheck cycle to pick up the new flag.
UPDATE "WatchAvailability"
SET "hasCustomPlayer" = true
WHERE "animeId" IN (
  SELECT DISTINCT "animeId" FROM "PlayerSource" WHERE "format" = 'hls'
);
