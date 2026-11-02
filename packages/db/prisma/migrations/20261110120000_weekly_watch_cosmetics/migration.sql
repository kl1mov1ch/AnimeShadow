-- Keep the existing settlement cursor: old weeks must never award PRO twice.
-- Existing podium receipts automatically unlock their permanent cosmetics.
ALTER TABLE "WeeklyWatchReward" DROP CONSTRAINT "WeeklyWatchReward_place_check";
ALTER TABLE "WeeklyWatchReward" DROP CONSTRAINT "WeeklyWatchReward_days_check";
ALTER TABLE "WeeklyWatchReward"
  ADD CONSTRAINT "WeeklyWatchReward_place_check" CHECK ("place" BETWEEN 1 AND 999),
  ADD CONSTRAINT "WeeklyWatchReward_days_check" CHECK (
    ("place" = 1 AND "days" = 7) OR
    ("place" = 2 AND "days" = 5) OR
    ("place" = 3 AND "days" = 3) OR
    ("place" BETWEEN 4 AND 999 AND "days" = 0)
  );
CREATE INDEX "WeeklyWatchReward_userId_place_awardedAt_idx"
  ON "WeeklyWatchReward" ("userId", "place", "awardedAt" DESC);
