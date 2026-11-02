-- Cosmetic receipts only. The existing shared cursor table gets a separate
-- watch-monthly-cosmetic key on activation; historical months stay untouched.
CREATE TABLE "MonthlyWatchAward" (
  "monthStart" TIMESTAMP(3) NOT NULL,
  "place" INTEGER NOT NULL CHECK ("place" BETWEEN 1 AND 999),
  "userId" TEXT NOT NULL,
  "seconds" BIGINT NOT NULL,
  "titles" INTEGER NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyWatchAward_pkey" PRIMARY KEY ("monthStart", "place"),
  CONSTRAINT "MonthlyWatchAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MonthlyWatchAward_monthStart_userId_key" ON "MonthlyWatchAward" ("monthStart", "userId");
CREATE INDEX "MonthlyWatchAward_userId_place_awardedAt_idx" ON "MonthlyWatchAward" ("userId", "place", "awardedAt" DESC);
