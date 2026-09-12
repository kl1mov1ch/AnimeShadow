-- Add the new array column
ALTER TABLE "User" ADD COLUMN "showcaseAchievementIds" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: carry the old single showcase pick into the new array
UPDATE "User"
SET "showcaseAchievementIds" = ARRAY["showcaseAchievementId"]
WHERE "showcaseAchievementId" IS NOT NULL;

-- Drop the old single-value column
ALTER TABLE "User" DROP COLUMN "showcaseAchievementId";
