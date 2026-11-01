CREATE TABLE "LeaderboardRewardCursor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nextWeek" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "WeeklyWatchReward" (
  "weekStart" TIMESTAMP(3) NOT NULL,
  "place" INTEGER NOT NULL CHECK ("place" BETWEEN 1 AND 3),
  "userId" TEXT NOT NULL,
  "days" INTEGER NOT NULL CHECK ("days" IN (7, 5, 3)),
  "seconds" BIGINT NOT NULL,
  "titles" INTEGER NOT NULL,
  "proUntilAfter" TIMESTAMP(3),
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyWatchReward_pkey" PRIMARY KEY ("weekStart", "place"),
  CONSTRAINT "WeeklyWatchReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WeeklyWatchReward_weekStart_userId_key" ON "WeeklyWatchReward"("weekStart", "userId");
CREATE INDEX "WeeklyWatchReward_userId_awardedAt_idx" ON "WeeklyWatchReward"("userId", "awardedAt");
