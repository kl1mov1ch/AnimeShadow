CREATE TABLE "GuessScore" (
    "userId" TEXT NOT NULL,
    "best" INTEGER NOT NULL DEFAULT 0,
    "current" INTEGER NOT NULL DEFAULT 0,
    "played" INTEGER NOT NULL DEFAULT 0,
    "bestAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuessScore_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "GuessScore_best_idx" ON "GuessScore"("best");
ALTER TABLE "GuessScore" ADD CONSTRAINT "GuessScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
