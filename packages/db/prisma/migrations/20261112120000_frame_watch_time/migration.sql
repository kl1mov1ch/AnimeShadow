ALTER TABLE "WatchSession" ADD COLUMN "rewardSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_rewardSeconds_check" CHECK ("rewardSeconds" >= 0 AND "rewardSeconds" <= "seconds");
CREATE INDEX "WatchSession_userId_animeId_episode_idx" ON "WatchSession"("userId", "animeId", "episode");
