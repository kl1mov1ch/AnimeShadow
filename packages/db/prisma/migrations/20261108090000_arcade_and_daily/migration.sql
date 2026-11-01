CREATE TABLE "OpeningScore" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "best" INTEGER NOT NULL DEFAULT 0,
  "current" INTEGER NOT NULL DEFAULT 0,
  "played" INTEGER NOT NULL DEFAULT 0,
  "bestAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpeningScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OpeningScore_best_bestAt_idx" ON "OpeningScore"("best" DESC, "bestAt");
CREATE TABLE "DailyChallenge" (
  "day" TEXT NOT NULL PRIMARY KEY,
  "questions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "DailyAttempt" (
  "day" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "answered" INTEGER NOT NULL DEFAULT 0,
  "score" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "DailyAttempt_pkey" PRIMARY KEY ("day", "userId"),
  CONSTRAINT "DailyAttempt_day_fkey" FOREIGN KEY ("day") REFERENCES "DailyChallenge"("day") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DailyAttempt_day_score_finishedAt_idx" ON "DailyAttempt"("day", "score" DESC, "finishedAt");
